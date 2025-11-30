import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { openRouterService } from '@/lib/llm/OpenRouterService'
import { z } from 'zod'

// Validation schema for usage query parameters
const usageQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).optional().default('month'),
  modelProvider: z.string().optional(),
  modelId: z.string().optional(),
  dateFrom: z.string().optional().transform(val => new Date(val)),
  dateTo: z.string().optional().transform(val => new Date(val))
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
    const validatedParams = usageQuerySchema.parse(queryParams)

    const {
      period = 'month',
      modelProvider,
      modelId,
      dateFrom,
      dateTo
    } = validatedParams

    // Calculate date range based on period
    const now = new Date()
    let startDate: Date

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1)
        break
    }

    // Override with custom date range if provided
    const effectiveStartDate = dateFrom && dateFrom > startDate ? dateFrom : startDate
    const effectiveEndDate = dateTo && dateTo < now ? dateTo : now

    // Get usage data from database
    const [messageUsage, costAnalysis, modelUsage] = await Promise.all([
      // Message count over time
      prisma.message.groupBy({
        by: ['createdAt'], // Group by date
        where: {
          chat: {
            userId: session.user.id,
            ...(modelProvider && { chat: { modelProvider } }),
            ...(modelId && { chat: { modelName: modelId } }),
            createdAt: {
              gte: effectiveStartDate,
              lte: effectiveEndDate
            }
          }
        },
        _count: {
          id: true,
          createdAt: true
        },
        _sum: {
          createdAt: true
        }
      }),

      // Cost analysis
      getCostAnalysis(session.user.id, modelProvider, modelId, effectiveStartDate, effectiveEndDate),

      // Model-specific usage
      prisma.message.groupBy({
        by: ['chat'],
        where: {
          chat: {
            userId: session.user.id,
            ...(modelProvider && { modelProvider }),
            ...(modelId && { modelName: modelId }),
            createdAt: {
              gte: effectiveStartDate,
              lte: effectiveEndDate
            }
          }
        },
        _count: {
          id: true
        },
        include: {
          chat: {
            select: {
              modelProvider: true,
              modelName: true
            }
          }
        }
      })
    ])

    // Process usage data for charts and analytics
    const dailyUsage = processDailyUsage(messageUsage, effectiveStartDate, effectiveEndDate)
    const modelBreakdown = processModelBreakdown(modelUsage)
    const trends = calculateUsageTrends(dailyUsage)

    // Get current usage from OpenRouter service
    const currentUsage = openRouterService.getUserUsage(session.user.id)
    const limits = openRouterService.getUsageLimits('FREE') // This should come from user's actual tier

    return NextResponse.json({
      success: true,
      period: {
        type: period,
        startDate: effectiveStartDate.toISOString(),
        endDate: effectiveEndDate.toISOString(),
        custom: !!(dateFrom || dateTo)
      },
      usage: {
        totalMessages: dailyUsage.reduce((sum, day) => sum + day.count, 0),
        totalCost: costAnalysis.totalCost,
        averageMessagesPerDay: dailyUsage.reduce((sum, day) => sum + day.count, 0) / dailyUsage.length,
        peakUsageDay: dailyUsage.reduce((max, day) => day.count > max.count ? day : max, dailyUsage[0]),
        currentUsage: {
          messagesToday: currentUsage.messagesToday,
          tokensToday: currentUsage.tokensToday,
          costThisMonth: currentUsage.costThisMonth,
          remainingMessages: Math.max(0, limits.dailyMessages - currentUsage.messagesToday),
          remainingCostBudget: Math.max(0, limits.monthlyCostLimit - currentUsage.costThisMonth)
        }
      },
      breakdown: {
        daily: dailyUsage,
        byModel: modelBreakdown,
        byProvider: groupModelsByProvider(modelBreakdown)
      },
      trends: {
        direction: trends.direction,
        growthRate: trends.growthRate,
        prediction: trends.prediction
      },
      limits: {
        dailyMessages: limits.dailyMessages,
        maxTokensPerMessage: limits.maxTokensPerMessage,
        monthlyCostLimit: limits.monthlyCostLimit
      },
      filters: {
        modelProvider,
        modelId,
        period
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Get usage stats error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to get cost analysis
async function getCostAnalysis(
  userId: string,
  modelProvider?: string,
  modelId?: string,
  startDate: Date,
  endDate: Date
) {
  const allModels = openRouterService.getAvailableModels()

  const messages = await prisma.message.findMany({
    where: {
      chat: {
        userId,
        ...(modelProvider && { modelProvider }),
        ...(modelId && { modelName: modelId }),
        createdAt: { gte: startDate, lte: endDate }
      }
    },
    include: {
      chat: {
        select: {
          modelProvider: true,
          modelName: true
        }
      }
    }
  })

  let totalCost = 0
  const costsByModel = new Map<string, number>()

  messages.forEach(message => {
    const model = allModels.find(m =>
      m.provider === message.chat.modelProvider && m.id === message.chat.modelName
    )

    if (model && message.tokenUsage) {
      const messageCost = ((message.tokenUsage as any).totalTokens || 0) / 1000 * model.costPer1KTokens
      totalCost += messageCost

      const modelKey = `${message.chat.modelProvider}:${message.chat.modelName}`
      costsByModel.set(modelKey, (costsByModel.get(modelKey) || 0) + messageCost)
    }
  })

  return {
    totalCost,
    costsByModel: Array.from(costsByModel.entries()).map(([model, cost]) => {
      const [provider, modelName] = model.split(':')
      return { provider, modelName, cost }
    })
  }
}

// Process message usage into daily breakdown
function processDailyUsage(messageUsage: any[], startDate: Date, endDate: Date) {
  const dailyMap = new Map<string, { date: string; count: number; tokens: number }>()

  // Initialize all days in range with zero
  const currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0]
    dailyMap.set(dateKey, { date: dateKey, count: 0, tokens: 0 })
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Add actual usage
  messageUsage.forEach((day: any) => {
    const dateKey = new Date(day.createdAt).toISOString().split('T')[0]
    const existing = dailyMap.get(dateKey)
    if (existing) {
      existing.count = day._count.id
      existing.tokens = day._sum.createdAt || 0
    }
  })

  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// Process model usage breakdown
function processModelBreakdown(modelUsage: any[]) {
  const modelCounts = new Map<string, { messages: number; provider: string; name: string }>()

  modelUsage.forEach((chat: any) => {
    const modelKey = `${chat.chat.modelProvider}:${chat.chat.modelName}`
    const existing = modelCounts.get(modelKey)

    if (existing) {
      existing.messages += chat._count.id
    } else {
      modelCounts.set(modelKey, {
        messages: chat._count.id,
        provider: chat.chat.modelProvider,
        name: chat.chat.modelName
      })
    }
  })

  return Array.from(modelCounts.values()).sort((a, b) => b.messages - a.messages)
}

// Group models by provider
function groupModelsByProvider(modelBreakdown: any[]) {
  const providers = new Map<string, { totalMessages: number; models: any[] }>()

  modelBreakdown.forEach(model => {
    const existing = providers.get(model.provider)

    if (existing) {
      existing.totalMessages += model.messages
      existing.models.push(model)
    } else {
      providers.set(model.provider, {
        totalMessages: model.messages,
        models: [model]
      })
    }
  })

  return Array.from(providers.entries()).map(([provider, data]) => ({
    provider,
    totalMessages: data.totalMessages,
    models: data.models
  }))
}

// Calculate usage trends
function calculateUsageTrends(dailyUsage: { date: string; count: number }[]) {
  if (dailyUsage.length < 7) {
    return {
      direction: 'insufficient_data',
      growthRate: 0,
      prediction: null
    }
  }

  // Compare last 7 days with previous 7 days
  const recent = dailyUsage.slice(-7)
  const previous = dailyUsage.slice(-14, -7)

  const recentAverage = recent.reduce((sum, day) => sum + day.count, 0) / recent.length
  const previousAverage = previous.reduce((sum, day) => sum + day.count, 0) / previous.length

  const growthRate = previousAverage > 0 ? ((recentAverage - previousAverage) / previousAverage) * 100 : 0

  // Simple prediction based on recent trend
  const prediction = growthRate > 0 ? Math.ceil(recentAverage * 1.1) : Math.floor(recentAverage * 0.9)

  return {
    direction: growthRate > 5 ? 'increasing' : growthRate < -5 ? 'decreasing' : 'stable',
    growthRate: Math.round(growthRate * 100) / 100,
    prediction: Math.max(0, prediction)
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}