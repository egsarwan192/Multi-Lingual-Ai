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
    // TODO: Authentication removed - all chat access is now public
    console.warn('Authentication removed - chat message API is now public')

    // Validate request body
    const body = await request.json()
    const validatedData = sendMessageSchema.parse(body)
    const { chatId, message, stream } = validatedData

    // Get chat (no user ownership validation since auth is removed)
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId
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

    // TODO: Subscriptions removed - use PRO tier equivalent (full access)
    const userSubscriptionTier = 'PRO'

    // Check if model is available (all models available for PRO tier)
    const availableModels = openRouterService.getModelsByTier('PRO')
    const modelAvailable = availableModels.some(m =>
      m.provider === chat.modelProvider && m.id === chat.modelName
    )

    if (!modelAvailable) {
      return NextResponse.json(
        { error: 'Model not available', code: 'model_not_available' },
        { status: 403 }
      )
    }

    // TODO: Subscriptions removed - no usage limits
    const messageTokens = openRouterService.estimateTokens(message)
    // Always allow sending since limits are removed

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