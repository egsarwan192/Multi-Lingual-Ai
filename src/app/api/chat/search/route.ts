import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ModelProvider } from '@prisma/client'

// Validation schema for search query
const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => Math.min(parseInt(val || '20'), 50)), // Max 50 results for search
  modelProvider: z.nativeEnum(ModelProvider).optional(),
  dateRange: z.enum(['all', 'week', 'month', 'year']).optional().default('all'),
  sortBy: z.enum(['relevance', 'date', 'model']).optional().default('relevance')
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
    const validatedData = searchSchema.parse(body)

    const {
      query,
      page = 1,
      limit = 20,
      modelProvider,
      dateRange,
      sortBy
    } = validatedData

    // Calculate date range based on selection
    const now = new Date()
    let dateFrom: Date | undefined

    switch (dateRange) {
      case 'week':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'year':
        dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        dateFrom = undefined
    }

    // Build search query with full-text search
    const searchWhere: any = {
      userId: session.user.id,
      messages: {
        some: {
          content: {
            contains: query,
            mode: 'insensitive'
          }
        }
      },
      ...(modelProvider && { modelProvider }),
      ...(dateFrom && { createdAt: { gte: dateFrom } })
    }

    // Determine sort order
    let orderBy: any
    switch (sortBy) {
      case 'date':
        orderBy = { updatedAt: 'desc' as const }
        break
      case 'model':
        orderBy = [{ modelProvider: 'asc' as const }, { updatedAt: 'desc' as const }]
        break
      case 'relevance':
      default:
        // For relevance, we'll prioritize chats with more exact matches
        orderBy = { updatedAt: 'desc' as const } // Fallback to most recent
        break
    }

    // Get search results
    const [chats, total, searchStats] = await Promise.all([
      // Get chats with pagination
      prisma.chat.findMany({
        where: searchWhere,
        include: {
          messages: {
            where: {
              content: {
                contains: query,
                mode: 'insensitive'
              }
            },
            select: {
              content: true,
              createdAt: true,
              role: true
            },
            orderBy: { createdAt: 'asc' }
          },
          _count: {
            select: { messages: true }
          }
        },
        orderBy,
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
          }
        }
      }),

      // Get total count
      prisma.chat.count({ where: searchWhere }),

      // Get search statistics
      getSearchStatistics(session.user.id, query, modelProvider, dateFrom)
    ])

    // Process and highlight search results
    const transformedChats = chats.map(chat => {
      // Find matching messages and highlight query
      const matchingMessages = chat.messages || []
      const highlightedMessages = matchingMessages.map(msg => ({
        ...msg,
        content: highlightText(msg.content, query)
      }))

      // Generate relevance score (simple implementation)
      const relevanceScore = calculateRelevanceScore(
        query,
        chat.title || '',
        matchingMessages.map(m => m.content)
      )

      return {
        id: chat.id,
        title: chat.title ? highlightText(chat.title, query) : `Chat about ${matchingMessages[0]?.content?.substring(0, 50) || 'Untitled'}...`,
        modelProvider: chat.modelProvider,
        modelName: chat.modelName,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messageCount: chat._count.messages,
        matchCount: matchingMessages.length,
        relevanceScore,
        preview: matchingMessages[0]?.content ? highlightText(matchingMessages[0].content.substring(0, 200), query) : '',
        matchingMessages: highlightedMessages.slice(0, 3) // Show first 3 matching messages
      }
    })

    // Sort by relevance score if requested
    if (sortBy === 'relevance') {
      transformedChats.sort((a, b) => b.relevanceScore - a.relevanceScore)
    }

    return NextResponse.json({
      success: true,
      query: {
        text: query,
        filters: {
          modelProvider,
          dateRange,
          dateFrom,
          sortBy
        }
      },
      results: transformedChats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      searchStats,
      suggestions: generateSearchSuggestions(query, searchStats)
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Chat search error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to highlight search query in text
function highlightText(text: string, query: string): string {
  if (!text || !query) return text
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

// Simple regex escaping
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Calculate relevance score for search results
function calculateRelevanceScore(query: string, title: string, messages: string[]): number {
  let score = 0
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)

  // Title matches score higher
  const titleText = title.toLowerCase()
  queryWords.forEach(word => {
    if (titleText.includes(word)) {
      score += 10
    }
  })

  // Message content matches
  const allMessageText = messages.join(' ').toLowerCase()
  queryWords.forEach(word => {
    const occurrences = (allMessageText.match(new RegExp(word, 'g')) || []).length
    score += Math.min(occurrences * 2, 5) // Cap at 5 per word
  })

  // Bonus for exact phrase match
  if (allMessageText.includes(query.toLowerCase())) {
    score += 15
  }

  return score
}

// Get search statistics for analytics
async function getSearchStatistics(userId: string, query: string, modelProvider?: ModelProvider, dateFrom?: Date) {
  const [totalChats, totalMessages, modelBreakdown] = await Promise.all([
    prisma.chat.count({
      where: {
        userId,
        ...(modelProvider && { modelProvider }),
        ...(dateFrom && { createdAt: { gte: dateFrom } })
      }
    }),
    prisma.message.count({
      where: {
        chat: {
          userId,
          ...(modelProvider && { chat: { modelProvider } }),
          ...(dateFrom && { chat: { createdAt: { gte: dateFrom } }) })
        }
      }
    }),
    prisma.chat.groupBy({
      by: ['modelProvider'],
      where: {
        userId,
        ...(modelProvider && { modelProvider }),
        ...(dateFrom && { createdAt: { gte: dateFrom } })
      },
      _count: { modelProvider: true }
    })
  ])

  return {
    totalChats,
    totalMessages,
    modelBreakdown: modelBreakdown.map(stat => ({
      provider: stat.modelProvider,
      count: stat._count.modelProvider
    })),
    queryLength: query.length,
    wordCount: query.split(/\s+/).length
  }
}

// Generate search suggestions based on query and results
function generateSearchSuggestions(query: string, searchStats: any): string[] {
  const suggestions: string[] = []

  // Model-based suggestions
  if (searchStats?.modelBreakdown) {
    const topModel = searchStats.modelBreakdown
      .sort((a: any, b: any) => b.count - a.count)[0]
    if (topModel) {
      suggestions.push(`Search "${query}" in ${topModel.provider} conversations`)
    }
  }

  // Query refinement suggestions
  const words = query.split(/\s+/).filter(w => w.length > 3)
  if (words.length > 1) {
    suggestions.push(`Try searching for specific terms: ${words.slice(0, 2).join(', ')}`)
  }

  return suggestions.slice(0, 3) // Return top 3 suggestions
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}