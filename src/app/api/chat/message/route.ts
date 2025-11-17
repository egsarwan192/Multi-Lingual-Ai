import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { openRouterService } from '@/lib/llm/OpenRouterService'
import { z } from 'zod'
import { Message } from '@/lib/llm/types'

// Validation schema for sending message
const sendMessageSchema = z.object({
  chatId: z.string().min(1, 'Chat ID is required'),
  message: z.string().min(1, 'Message cannot be empty').max(10000, 'Message too long'),
  stream: z.boolean().optional().default(true)
})

export async function POST(request: NextRequest) {
  try {
    // Get current session
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'no_session' },
        { status: 401 }
      )
    }

    // Validate request body
    const body = await request.json()
    const validatedData = sendMessageSchema.parse(body)
    const { chatId, message, stream } = validatedData

    // Get chat and validate user ownership
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId: session.user.id
      },
      include: {
        messages: {
          take: 50, // Limit context to last 50 messages
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found', code: 'chat_not_found' },
        { status: 404 }
      )
    }

    // Get user's subscription tier
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found', code: 'user_not_found' },
        { status: 404 }
      )
    }

    // Check if user has access to the chat's model
    const availableModels = openRouterService.getModelsByTier(user.subscriptionTier)
    const modelAvailable = availableModels.some(m =>
      m.provider === chat.modelProvider && m.id === chat.modelName
    )

    if (!modelAvailable) {
      return NextResponse.json(
        { error: 'Model not available for your subscription tier', code: 'model_not_allowed' },
        { status: 403 }
      )
    }

    // Check usage limits before sending
    const messageTokens = openRouterService.estimateTokens(message)
    const canSend = openRouterService.canSendMessage(
      session.user.id,
      user.subscriptionTier,
      messageTokens
    )

    if (!canSend.canSend) {
      return NextResponse.json(
        { error: canSend.reason, code: 'usage_limit' },
        { status: 429 }
      )
    }

    // Convert chat messages to OpenRouter format
    const conversation: Message[] = chat.messages.map(msg => ({
      role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: msg.createdAt
    }))

    // Save user message to database first
    const userMessage = await prisma.message.create({
      data: {
        chatId,
        role: 'USER',
        content: message,
        tokenUsage: {
          inputTokens: messageTokens,
          outputTokens: 0,
          totalTokens: messageTokens
        }
      }
    })

    // Update chat's last updated time
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    })

    if (!stream) {
      // Non-streaming response (fallback)
      try {
        const response = await openRouterService.sendMessage(
          message,
          conversation,
          chat.modelName,
          session.user.id
        )

        // Save assistant response to database
        await prisma.message.create({
          data: {
            chatId,
            role: 'ASSISTANT',
            content: response.content,
            tokenUsage: {
              inputTokens: response.usage.promptTokens,
              outputTokens: response.usage.completionTokens,
              totalTokens: response.usage.totalTokens
            }
          }
        })

        return NextResponse.json({
          success: true,
          userMessage: {
            id: userMessage.id,
            content: message,
            role: 'USER',
            timestamp: userMessage.createdAt
          },
          assistantMessage: {
            content: response.content,
            role: 'ASSISTANT',
            usage: response.usage,
            model: response.model,
            provider: response.provider
          }
        })
      } catch (error: any) {
        return NextResponse.json(
          { error: error.error || 'Failed to send message', code: error.code || 'send_failed' },
          { status: error.type === 'rate_limit' ? 429 : 500 }
        )
      }
    } else {
      // Streaming response
      const encoder = new TextEncoder()

      try {
        const llmStream = await openRouterService.sendMessageStream(
          message,
          conversation,
          chat.modelName,
          session.user.id
        )

        return new Response(llmStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          }
        })
      } catch (error: any) {
        // Create error stream
        const errorStream = new ReadableStream({
          start(controller) {
            const errorData = {
              type: 'error',
              error: error.error || 'Failed to send message',
              code: error.code || 'send_failed',
              userMessage: {
                id: userMessage.id,
                content: message,
                role: 'USER',
                timestamp: userMessage.createdAt
              }
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`))
            controller.close()
          }
        })

        return new Response(errorStream, {
          status: error.type === 'rate_limit' ? 429 : 500,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          }
        })
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Send message error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}