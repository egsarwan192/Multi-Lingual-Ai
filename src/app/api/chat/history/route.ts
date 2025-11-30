import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ModelProvider } from '@prisma/client'

// Validation schema for history query parameters
const historyQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => Math.min(parseInt(val || '20'), 100)),
  modelProvider: z.nativeEnum(ModelProvider).optional(),
  dateFrom: z.string().optional().transform(val => new Date(val)),
  dateTo: z.string().optional().transform(val => new Date(val)),
  search: z.string().optional()
})

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'no_session' },
        { status: 401 }
      )
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url)
    const queryParams = Object.fromEntries(searchParams.entries())
    const validatedParams = historyQuerySchema.parse(queryParams)

    const {
      page = 1,
      limit = 20,
      modelProvider,
      dateFrom,
      dateTo,
      search
    } = validatedParams

    // Build where clause for filtering
    const where: any = {
      userId: session.user.id,
      ...(modelProvider && { modelProvider }),
      ...(dateFrom && { createdAt: { gte: dateFrom } }),
      ...(dateTo && { createdAt: { lte: dateTo } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          {
            messages: {
              some: {
                content: { contains: search, mode: 'insensitive' }
              }
            }
          }
        ]
      })
    }

    // Get chats with filtering and pagination
    const [chats, total] = await Promise.all([
      prisma.chat.findMany({
        where,
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
        skip: (page - 1) * limit,
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
              createdAt: true,
              role: true
            }
          }
        }
      }),
      prisma.chat.count({ where })
    ])

    // Transform chats for response
    const transformedChats = chats.map(chat => ({
      id: chat.id,
      title: chat.title || `Chat about ${chat.messages[0]?.content?.substring(0, 50) || 'Untitled'}...`,
      modelProvider: chat.modelProvider,
      modelName: chat.modelName,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat._count.messages,
      preview: chat.messages[0]?.content || '',
      firstMessageRole: chat.messages[0]?.role || 'USER'
    }))

    // Calculate statistics
    const stats = await getChatStatistics(session.user.id, where)

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
      },
      filters: {
        modelProvider,
        dateFrom,
        dateTo,
        search
      },
      stats
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Get chat history error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to get chat statistics
async function getChatStatistics(userId: string, whereClause: any) {
  const [modelStats, totalMessages, avgMessagesPerChat] = await Promise.all([
    // Get statistics by model provider
    prisma.chat.groupBy({
      by: ['modelProvider'],
      where: { userId },
      _count: { modelProvider: true },
      _avg: {
        _all: {
          _count: {
            messages: true
          }
        }
      }
    }),

    // Get total message count
    prisma.message.count({
      where: {
        chat: { userId }
      }
    }),

    // Average messages per chat
    prisma.chat.aggregate({
      where: { userId },
      _avg: {
        _count: {
          messages: true
        }
      }
    })
  ])

  return {
    totalChats: modelStats.length,
    totalMessages,
    averageMessagesPerChat: avgMessagesPerChat._avg._count.messages || 0,
    modelBreakdown: modelStats.map(stat => ({
      provider: stat.modelProvider,
      count: stat._count.modelProvider
    }))
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}