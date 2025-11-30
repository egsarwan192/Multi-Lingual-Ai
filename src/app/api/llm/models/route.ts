import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { openRouterService } from '@/lib/llm/OpenRouterService'

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

    // Get all available models
    const allModels = openRouterService.getAvailableModels()
    const userModels = openRouterService.getModelsByTier(user.subscriptionTier)

    // Get LLM provider records from database
    const llmProviders = await prisma.lLMProvider.findMany({
      where: { isActive: true }
    })

    // Enhance models with database information
    const enhancedModels = allModels.map(model => {
      const dbProvider = llmProviders.find(p => p.name === model.provider)
      const isUserAccessible = userModels.some(m =>
        m.id === model.id && m.provider === model.provider
      )

      return {
        ...model,
        status: isUserAccessible ? 'available' : 'premium_required',
        apiInfo: dbProvider ? {
          name: dbProvider.displayName,
          isActive: dbProvider.isActive,
          config: dbProvider.apiConfig
        } : null,
        capabilities: getModelCapabilities(model.id),
        performance: {
          avgResponseTime: Math.random() * 100 + 50, // Mock: 50-150ms
          reliability: 99.5, // Mock reliability percentage
          popularity: getMockPopularity(model.id)
        },
        restrictions: {
          requiresSubscription: model.tier !== 'free',
          maxInputTokens: model.maxTokens,
          contextWindow: model.contextWindow,
          rateLimit: getModelRateLimit(model.id)
        },
        usage: {
          recommendedFor: getRecommendedUseCases(model.id),
          bestFor: getBestUseCases(model.id),
          notRecommendedFor: getNotRecommendedUseCases(model.id)
        }
      }
    })

    // Group models by provider for better organization
    const modelsByProvider = enhancedModels.reduce((acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = []
      }
      acc[model.provider].push(model)
      return acc
    }, {} as Record<string, any[]>)

    // Calculate model statistics
    const stats = {
      totalModels: enhancedModels.length,
      freeModels: enhancedModels.filter(m => m.tier === 'free').length,
      premiumModels: enhancedModels.filter(m => m.tier === 'premium').length,
      accessibleToUser: userModels.length,
      userTier: user.subscriptionTier
    }

    return NextResponse.json({
      success: true,
      models: enhancedModels,
      modelsByProvider,
      stats,
      user: {
        tier: user.subscriptionTier,
        accessibleModelCount: userModels.length
      },
      metadata: {
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
        refreshInterval: 300000 // 5 minutes
      },
      filters: {
        tiers: ['free', 'premium'],
        providers: ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'DEEPSEEK'],
        capabilities: ['text', 'streaming', 'function-calling', 'multimodal']
      }
    })
  } catch (error) {
    console.error('Get models error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to get model capabilities
function getModelCapabilities(modelId: string): string[] {
  const capabilities: Record<string, string[]> = {
    'gpt-3.5-turbo': ['text', 'streaming', 'function-calling', 'code-generation'],
    'gpt-4': ['text', 'streaming', 'function-calling', 'reasoning', 'code-generation'],
    'gpt-4-turbo': ['text', 'streaming', 'function-calling', 'reasoning', 'vision'],
    'claude-3-sonnet-20240229': ['text', 'streaming', 'reasoning', 'long-context'],
    'claude-3-haiku-20240307': ['text', 'streaming', 'fast-responses', 'efficiency'],
    'gemini-1.5-flash': ['text', 'streaming', 'multimodal', 'fast-responses'],
    'gemini-1.5-pro': ['text', 'streaming', 'multimodal', 'reasoning', 'large-context'],
    'deepseek-coder': ['text', 'streaming', 'code-specialization', 'open-weights'],
    'deepseek-chat': ['text', 'streaming', 'general-purpose', 'cost-effective']
  }

  return capabilities[modelId] || ['text']
}

// Helper function to get model rate limits
function getModelRateLimit(modelId: string): string {
  const rateLimits: Record<string, string> = {
    'gpt-3.5-turbo': '3500 requests/hour',
    'gpt-4': '200 requests/hour',
    'gpt-4-turbo': '3500 requests/hour',
    'claude-3-sonnet-20240229': '1000 requests/hour',
    'claude-3-haiku-20240307': '5000 requests/hour',
    'gemini-1.5-flash': '15 requests/minute',
    'gemini-1.5-pro': '2 requests/minute',
    'deepseek-coder': '100 requests/minute',
    'deepseek-chat': '100 requests/minute'
  }

  return rateLimits[modelId] || 'Unknown'
}

// Helper function to get mock popularity data
function getMockPopularity(modelId: string): number {
  const popularity: Record<string, number> = {
    'gpt-3.5-turbo': 85,
    'gpt-4': 95,
    'gpt-4-turbo': 90,
    'claude-3-sonnet-20240229': 80,
    'claude-3-haiku-20240307': 70,
    'gemini-1.5-flash': 65,
    'gemini-1.5-pro': 75,
    'deepseek-coder': 60,
    'deepseek-chat': 55
  }

  return popularity[modelId] || 50
}

// Helper function for recommended use cases
function getRecommendedUseCases(modelId: string): string[] {
  const recommendations: Record<string, string[]> = {
    'gpt-3.5-turbo': ['general chat', 'quick responses', 'cost-effective queries'],
    'gpt-4': ['complex reasoning', 'creative writing', 'analysis'],
    'gpt-4-turbo': ['balanced performance', 'fast complex tasks', 'large documents'],
    'claude-3-sonnet-20240229': ['long conversations', 'detailed analysis', 'academic writing'],
    'claude-3-haiku-20240307': ['quick responses', 'summarization', 'simple tasks'],
    'gemini-1.5-flash': ['real-time responses', 'multimodal tasks', 'rapid iteration'],
    'gemini-1.5-pro': ['complex analysis', 'research', 'large context tasks'],
    'deepseek-coder': ['programming', 'code review', 'technical documentation'],
    'deepseek-chat': ['general conversation', 'cost-effective chat', 'business queries']
  }

  return recommendations[modelId] || ['general conversation']
}

// Helper function for best use cases
function getBestUseCases(modelId: string): string[] {
  const bestCases: Record<string, string[]> = {
    'gpt-3.5-turbo': ['quick answers', 'simple coding', 'draft generation'],
    'gpt-4': ['problem solving', 'creative writing', 'complex analysis'],
    'gpt-4-turbo': ['speed + quality', 'professional tasks', 'document processing'],
    'claude-3-sonnet-20240229': ['in-depth analysis', 'conversation', 'research'],
    'claude-3-haiku-20240307': ['quick assistance', 'summarization', 'productivity'],
    'gemini-1.5-flash': ['real-time interaction', 'image analysis', 'speed prioritized'],
    'gemini-1.5-pro': ['research projects', 'comprehensive analysis', 'multimodal tasks'],
    'deepseek-coder': ['software development', 'code optimization', 'debugging'],
    'deepseek-chat': ['daily assistance', 'cost-effective operations', 'general queries']
  }

  return bestCases[modelId] || ['general tasks']
}

// Helper function for not recommended use cases
function getNotRecommendedUseCases(modelId: string): string[] {
  const notRecommended: Record<string, string[]> = {
    'gpt-3.5-turbo': ['complex reasoning', 'large context analysis', 'professional research'],
    'gpt-4': ['real-time applications', 'cost-critical operations', 'high-frequency requests'],
    'gpt-4-turbo': ['simple tasks where cost is primary concern', 'very high-frequency use'],
    'claude-3-sonnet-20240229': ['real-time applications', 'simple Q&A'],
    'claude-3-haiku-20240307': ['complex analysis', 'large document processing'],
    'gemini-1.5-flash': ['academic research', 'complex reasoning'],
    'gemini-1.5-pro': ['cost-critical real-time applications'],
    'deepseek-coder': ['creative writing', 'general conversation'],
    'deepseek-chat': ['specialized technical tasks']
  }

  return notRecommended[modelId] || []
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}