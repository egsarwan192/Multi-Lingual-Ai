import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { openRouterService } from '@/lib/llm/OpenRouterService'
import { z } from 'zod'

// Server-side ModelProvider type (matches Prisma schema)
type ModelProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'DEEPSEEK'

// Validation schema for cost analysis query parameters
const costsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).optional().default('month'),
  modelProvider: z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'DEEPSEEK']).optional(),
  modelId: z.string().optional(),
  dateFrom: z.string().optional().transform(val => new Date(val)),
  dateTo: z.string().optional().transform(val => new Date(val)),
  includeProjections: z.boolean().optional().default(true)
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
    const validatedParams = costsQuerySchema.parse(queryParams)

    const {
      period = 'month',
      modelProvider,
      modelId,
      dateFrom,
      dateTo,
      includeProjections
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

    // Get cost data from database
    const [messageCosts, modelCosts, providerCosts] = await Promise.all([
      // Per-message cost breakdown
      getMessageCostData(session.user.id, modelProvider, modelId, effectiveStartDate, effectiveEndDate),

      // Model-level cost analysis
      getModelCostData(session.user.id, modelProvider, effectiveStartDate, effectiveEndDate),

      // Provider-level cost analysis
      getProviderCostData(session.user.id, effectiveStartDate, effectiveEndDate)
    ])

    // Generate cost projections if requested
    const projections = includeProjections ?
      generateCostProjections(session.user.id, period, messageCosts) : null

    // Validate messageCosts parameter
    if (messageCosts.dailyBreakdown && !Array.isArray(messageCosts.dailyBreakdown)) {
      throw new Error('dailyBreakdown must be an array when provided')
    }

    // Calculate cost optimization suggestions
    const suggestions = generateCostOptimizationSuggestions(messageCosts, modelCosts)

    return NextResponse.json({
      success: true,
      period: {
        type: period,
        startDate: effectiveStartDate.toISOString(),
        endDate: effectiveEndDate.toISOString(),
        custom: !!(dateFrom || dateTo)
      },
      costs: {
        total: messageCosts.totalCost,
        breakdown: {
          byModel: modelCosts,
          byProvider: providerCosts,
          daily: messageCosts.dailyBreakdown,
          byType: {
            input: messageCosts.inputCosts,
            output: messageCosts.outputCosts,
            total: messageCosts.totalCost
          }
        }
      },
      analytics: {
        averageCostPerDay: messageCosts.averageCostPerDay,
        mostExpensiveModel: modelCosts.sort((a, b) => b.totalCost - a.totalCost)[0],
        costTrend: calculateCostTrend(messageCosts.dailyBreakdown),
        savings: projections?.potentialSavings
      },
      projections,
      recommendations: suggestions,
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

    console.error('Get costs error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get message-level cost data
async function getMessageCostData(
  userId: string,
  modelProvider?: ModelProvider,
  modelId?: string,
  startDate: Date,
  endDate: Date
) {
  const messages = await prisma.message.findMany({
    where: {
      chat: {
        userId,
        ...(modelProvider && { modelProvider }),
        createdAt: { gte: startDate, lte: endDate }
      },
      ...(modelId && {
        chat: {
          modelName: modelId
        }
      })
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

  const allModels = openRouterService.getAvailableModels()
  let totalCost = 0
  const dailyBreakdown = new Map<string, { date: string; cost: number; messageCount: number }>()
  const inputCosts = new Map<string, number>()
  const outputCosts = new Map<string, number>()

  messages.forEach(message => {
    const model = allModels.find(m =>
      m.provider === message.chat.modelProvider && m.id === message.chat.modelName
    )

    if (model && message.tokenUsage) {
      const usage = message.tokenUsage as any
      const inputCost = (usage.inputTokens / 1000) * model.costPer1KTokens
      const outputCost = (usage.outputTokens / 1000) * model.costPer1KTokens
      const totalMessageCost = inputCost + outputCost

      totalCost += totalMessageCost

      const dateKey = new Date(message.createdAt).toISOString().split('T')[0]
      const existing = dailyBreakdown.get(dateKey)

      if (existing) {
        existing.cost += totalMessageCost
        existing.messageCount += 1
      } else {
        dailyBreakdown.set(dateKey, {
          date: dateKey,
          cost: totalMessageCost,
          messageCount: 1
        })
      }

      // Accumulate input/output costs
      inputCosts.set(message.chat.modelProvider, (inputCosts.get(message.chat.modelProvider) || 0) + inputCost)
      outputCosts.set(message.chat.modelProvider, (outputCosts.get(message.chat.modelProvider) || 0) + outputCost)
    }
  })

  return {
    totalCost,
    dailyBreakdown: Array.from(dailyBreakdown.values()).sort((a, b) => a.date.localeCompare(b.date)),
    inputCosts: Array.from(inputCosts.entries()).map(([provider, cost]) => ({ provider, cost })),
    outputCosts: Array.from(outputCosts.entries()).map(([provider, cost]) => ({ provider, cost }))
  }
}

// Get model-level cost data
async function getModelCostData(
  userId: string,
  modelProvider?: ModelProvider,
  startDate: Date,
  endDate: Date
) {
  const messages = await prisma.message.findMany({
    where: {
      chat: {
        userId,
        ...(modelProvider && { modelProvider }),
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

  const allModels = openRouterService.getAvailableModels()
  const modelCosts = new Map<string, {
    provider: string;
    modelId: string;
    modelName: string;
    messageCount: number;
    totalCost: number;
    averageCostPerMessage: number
  }>()

  messages.forEach(message => {
    const model = allModels.find(m =>
      m.provider === message.chat.modelProvider && m.id === message.chat.modelName
    )

    if (model && message.tokenUsage) {
      const usage = message.tokenUsage as any
      const totalMessageCost = ((usage.inputTokens + usage.outputTokens) / 1000) * model.costPer1KTokens
      const modelKey = `${message.chat.modelProvider}:${message.chat.modelName}`

      const existing = modelCosts.get(modelKey)
      if (existing) {
        existing.messageCount += 1
        existing.totalCost += totalMessageCost
      } else {
        modelCosts.set(modelKey, {
          provider: message.chat.modelProvider,
          modelId: message.chat.modelName,
          modelName: model.name,
          messageCount: 1,
          totalCost,
          averageCostPerMessage: totalMessageCost
        })
      }
    }
  })

  // Calculate averages
  modelCosts.forEach(model => {
    model.averageCostPerMessage = model.totalCost / model.messageCount
  })

  return Array.from(modelCosts.values()).sort((a, b) => b.totalCost - a.totalCost)
}

// Get provider-level cost data
async function getProviderCostData(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  const providerCosts = await prisma.message.groupBy({
    by: ['chat'],
    where: {
      chat: {
        userId,
        createdAt: { gte: startDate, lte: endDate }
      }
    },
    include: {
      chat: {
        select: {
          modelProvider: true
        }
      }
    }
  })

  const allModels = openRouterService.getAvailableModels()
  const results = providerCosts.map((provider: any) => {
    let totalCost = 0
    let messageCount = 0

    if (provider._sum.tokenUsage) {
      provider._sum.tokenUsage.forEach((usage: any) => {
        const model = allModels.find(m =>
          m.provider === provider.chat.modelProvider && m.id === provider.chat.modelName
        )

        if (model && usage) {
          const messageCost = ((usage.inputTokens + usage.outputTokens) / 1000) * model.costPer1KTokens
          totalCost += messageCost * provider._count.id // Multiply by message count
          messageCount += provider._count.id
        }
      })
    }

    return {
      provider: provider.chat.modelProvider,
      totalCost,
      messageCount,
      averageCostPerMessage: messageCount > 0 ? totalCost / messageCount : 0,
      modelCount: provider._count.id
    }
  })

  return results
}

// Generate cost projections
function generateCostProjections(
  userId: string,
  period: string,
  currentCosts: { dailyBreakdown: any[] }
) {
  const recentDaily = currentCosts.dailyBreakdown.slice(-7)
  const averageDailyCost = recentDaily.reduce((sum, day) => sum + day.cost, 0) / recentDaily.length

  let projectedMonthlyCost = 0
  switch (period) {
    case 'day':
      projectedMonthlyCost = averageDailyCost * 30
      break
    case 'week':
      projectedMonthlyCost = averageDailyCost * 30
      break
    case 'month':
      projectedMonthlyCost = currentCosts.totalCost
      break
    case 'year':
      projectedMonthlyCost = currentCosts.totalCost / 12
      break
  }

  // Calculate potential savings with different tiers
  const potentialSavings = {
    freeToPremium: Math.max(0, projectedMonthlyCost - 9.99),
    premiumToPro: Math.max(0, projectedMonthlyCost - 19.99)
  }

  return {
    dailyAverage: averageDailyCost,
    monthlyProjection: projectedMonthlyCost,
    yearlyProjection: projectedMonthlyCost * 12,
    potentialSavings,
    budgetRecommendation: projectedMonthlyCost > 10 ? 'Consider Pro tier for better value' :
                              projectedMonthlyCost > 5 ? 'Consider Premium tier for more usage' :
                              'Current tier seems optimal'
  }
}

// Calculate cost trend
function calculateCostTrend(dailyBreakdown: { cost: number }[]) {
  if (dailyBreakdown.length < 7) {
    return {
      direction: 'insufficient_data',
      changeRate: 0,
      forecast: null
    }
  }

  const recent = dailyBreakdown.slice(-7).map(d => d.cost)
  const previous = dailyBreakdown.slice(-14, -7).map(d => d.cost)

  const recentAverage = recent.reduce((sum, cost) => sum + cost, 0) / recent.length
  const previousAverage = previous.reduce((sum, cost) => sum + cost, 0) / previous.length

  const changeRate = previousAverage > 0 ? ((recentAverage - previousAverage) / previousAverage) * 100 : 0
  const forecastDaily = recentAverage + ((recent[recent.length - 1] - recent[0]) / (recent.length - 1))

  return {
    direction: changeRate > 5 ? 'increasing' : changeRate < -5 ? 'decreasing' : 'stable',
    changeRate: Math.round(changeRate * 100) / 100,
    forecast: Math.max(0, forecastDaily)
  }
}

// Generate cost optimization suggestions
function generateCostOptimizationSuggestions(
  messageCosts: any,
  modelCosts: any[]
) {
  const suggestions: any[] = []

  // Find most expensive model
  const mostExpensive = modelCosts.sort((a, b) => b.averageCostPerMessage - a.averageCostPerMessage)[0]
  if (mostExpensive && mostExpensive.averageCostPerMessage > 0.05) {
    suggestions.push({
      type: 'cost_optimization',
      priority: 'high',
      title: 'Consider using more cost-effective models',
      description: `Your most expensive model ${mostExpensive.modelName} costs ${mostExpensive.averageCostPerMessage.toFixed(4)} per message on average`,
      recommendation: `Try switching to ${mostExpensive.provider === 'OPENAI' ? 'Gemini or Deepseek' : 'GPT-3.5 Turbo'} for similar quality at lower cost`
    })
  }

  // Usage efficiency suggestions
  const dailyBreakdown = messageCosts.dailyBreakdown
  const highUsageDays = dailyBreakdown.filter(day => day.cost > 1.00)
  if (highUsageDays.length > dailyBreakdown.length * 0.3) {
    suggestions.push({
      type: 'usage_optimization',
      priority: 'medium',
      title: 'Consider batching messages',
      description: `${highUsageDays.length} out of ${dailyBreakdown.length} days had high usage ($1.00+)`,
      recommendation: 'Combine related queries into single messages to reduce token usage'
    })
  }

  return suggestions
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}