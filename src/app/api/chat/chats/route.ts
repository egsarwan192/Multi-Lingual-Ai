import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { openRouterService } from '@/lib/llm/OpenRouterService'
import { z } from 'zod'

// Server-side ModelProvider type (matches Prisma schema)
type ModelProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'DEEPSEEK'

// Validation schema for creating a new chat
const createChatSchema = z.object({
  title: z.string().optional(),
  modelProvider: z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'DEEPSEEK']),
  modelName: z.string().min(1, 'Model name is required'),
  initialMessage: z.string().min(1, 'Initial message is required')
})

export async function GET(request: NextRequest) {
  try {
    // TODO: Authentication removed - chat API is now public
    console.warn('Authentication removed - chat listing API is now public')

    // Parse query parameters for pagination
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100) // Max 100 per request
    const skip = (page - 1) * limit

    // Get public chats (no user filter since auth is removed)
    // In a real implementation, you might want to create a system user or handle this differently
    const chats = await prisma.chat.findMany({
      include: {
        messages: {
          take: 1, // Just get first message for preview
          orderBy: { createdAt: 'asc' }
        },
        _count: {
          select: { messages: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        modelProvider: true,
        modelName: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true }
        },
        messages: {
          select: {
            content: true,
            createdAt: true
          }
        }
      }
    })

    // Get total count for pagination (no user filter)
    const total = await prisma.chat.count()

    // Transform chats for response
    const transformedChats = chats.map(chat => ({
      id: chat.id,
      title: chat.title || `Chat about ${chat.messages[0]?.content?.substring(0, 50) || 'Untitled'}...`,
      modelProvider: chat.modelProvider,
      modelName: chat.modelName,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat._count.messages,
      preview: chat.messages[0]?.content || ''
    }))

    return NextResponse.json({
      success: true,
      chats: transformedChats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    })
  } catch (error) {
    console.error('Get chats error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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

    // Get user's subscription tier for model access validation
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

    // Validate request body
    const body = await request.json()
    const validatedData = createChatSchema.parse(body)
    const { title, modelProvider, modelName, initialMessage } = validatedData

    // Check if user has access to this model
    const availableModels = openRouterService.getModelsByTier(user.subscriptionTier)
    const requestedModel = availableModels.find(m =>
      m.provider === modelProvider && m.id === modelName
    )

    if (!requestedModel) {
      return NextResponse.json(
        { error: 'Model not available for your subscription tier', code: 'model_not_allowed' },
        { status: 403 }
      )
    }

    // Check usage limits
    const canSend = openRouterService.canSendMessage(
      session.user.id,
      user.subscriptionTier,
      openRouterService.estimateTokens(initialMessage)
    )

    if (!canSend.canSend) {
      return NextResponse.json(
        { error: canSend.reason, code: 'usage_limit' },
        { status: 429 }
      )
    }

    // Create chat in database
    const chat = await prisma.chat.create({
      data: {
        userId: session.user.id,
        title,
        modelProvider,
        modelName
      },
      select: {
        id: true,
        title: true,
        modelProvider: true,
        modelName: true,
        createdAt: true,
        updatedAt: true
      }
    })

    // Create initial message in database
    await prisma.message.create({
      data: {
        chatId: chat.id,
        role: 'USER',
        content: initialMessage,
        tokenUsage: {
          inputTokens: openRouterService.estimateTokens(initialMessage),
          outputTokens: 0,
          totalTokens: openRouterService.estimateTokens(initialMessage)
        }
      }
    })

    return NextResponse.json({
      success: true,
      chat: {
        id: chat.id,
        title: chat.title,
        modelProvider: chat.modelProvider,
        modelName: chat.modelName,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Create chat error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}