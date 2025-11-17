import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
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

    // Get provider health status
    const providerHealth = await openRouterService.validateProviderTokens()

    // Get detailed provider information with additional metrics
    const providers = [
      {
        id: 'OPENAI',
        name: 'OpenAI',
        displayName: 'OpenAI',
        description: 'GPT models including GPT-3.5, GPT-4, and GPT-4 Turbo',
        status: providerHealth.get('OPENAI') ? 'healthy' : 'error',
        healthDetails: {
          isOnline: providerHealth.get('OPENAI') || false,
          lastCheck: new Date().toISOString(),
          responseTime: Math.random() * 100 + 50, // Mock response time (50-150ms)
          errorRate: providerHealth.get('OPENAI') ? 0 : 100
        },
        models: openRouterService.getAvailableModels().filter(m => m.provider === 'OPENAI'),
        features: [
          'Streaming responses',
          'Function calling',
          'Vision support',
          'Code generation'
        ],
        pricing: {
          currency: 'USD',
          unit: '1K tokens',
          models: openRouterService.getAvailableModels()
            .filter(m => m.provider === 'OPENAI')
            .map(m => ({
              id: m.id,
              name: m.name,
              cost: m.costPer1KTokens,
              tier: m.tier
            }))
        },
        limits: {
          maxTokensPerRequest: 4096,
          contextWindow: 16384,
          rateLimit: 'Model-specific'
        }
      },
      {
        id: 'ANTHROPIC',
        name: 'Anthropic',
        displayName: 'Anthropic',
        description: 'Claude models including Sonnet and Haiku with strong reasoning capabilities',
        status: providerHealth.get('ANTHROPIC') ? 'healthy' : 'error',
        healthDetails: {
          isOnline: providerHealth.get('ANTHROPIC') || false,
          lastCheck: new Date().toISOString(),
          responseTime: Math.random() * 150 + 80, // Mock response time (80-230ms)
          errorRate: providerHealth.get('ANTHROPIC') ? 0 : 100
        },
        models: openRouterService.getAvailableModels().filter(m => m.provider === 'ANTHROPIC'),
        features: [
          'Streaming responses',
          'Long context',
          'Strong reasoning',
          'Constitutional AI'
        ],
        pricing: {
          currency: 'USD',
          unit: '1K tokens',
          models: openRouterService.getAvailableModels()
            .filter(m => m.provider === 'ANTHROPIC')
            .map(m => ({
              id: m.id,
              name: m.name,
              cost: m.costPer1KTokens,
              tier: m.tier
            }))
        },
        limits: {
          maxTokensPerRequest: 4096,
          contextWindow: 200000,
          rateLimit: 'Model-specific'
        }
      },
      {
        id: 'GOOGLE',
        name: 'Google',
        displayName: 'Google AI',
        description: 'Gemini models including Flash and Pro with multimodal capabilities',
        status: providerHealth.get('GOOGLE') ? 'healthy' : 'error',
        healthDetails: {
          isOnline: providerHealth.get('GOOGLE') || false,
          lastCheck: new Date().toISOString(),
          responseTime: Math.random() * 120 + 60, // Mock response time (60-180ms)
          errorRate: providerHealth.get('GOOGLE') ? 0 : 100
        },
        models: openRouterService.getAvailableModels().filter(m => m.provider === 'GOOGLE'),
        features: [
          'Streaming responses',
          'Multimodal input',
          'Large context',
          'Fast responses'
        ],
        pricing: {
          currency: 'USD',
          unit: '1K tokens',
          models: openRouterService.getAvailableModels()
            .filter(m => m.provider === 'GOOGLE')
            .map(m => ({
              id: m.id,
              name: m.name,
              cost: m.costPer1KTokens,
              tier: m.tier
            }))
        },
        limits: {
          maxTokensPerRequest: 8192,
          contextWindow: 2000000,
          rateLimit: 'Model-specific'
        }
      },
      {
        id: 'DEEPSEEK',
        name: 'Deepseek',
        displayName: 'Deepseek',
        description: 'Cost-effective models with strong coding capabilities',
        status: providerHealth.get('DEEPSEEK') ? 'healthy' : 'error',
        healthDetails: {
          isOnline: providerHealth.get('DEEPSEEK') || false,
          lastCheck: new Date().toISOString(),
          responseTime: Math.random() * 200 + 100, // Mock response time (100-300ms)
          errorRate: providerHealth.get('DEEPSEEK') ? 0 : 100
        },
        models: openRouterService.getAvailableModels().filter(m => m.provider === 'DEEPSEEK'),
        features: [
          'Streaming responses',
          'Code specialization',
          'Cost-effective',
          'Open weights available'
        ],
        pricing: {
          currency: 'USD',
          unit: '1K tokens',
          models: openRouterService.getAvailableModels()
            .filter(m => m.provider === 'DEEPSEEK')
            .map(m => ({
              id: m.id,
              name: m.name,
              cost: m.costPer1KTokens,
              tier: m.tier
            }))
        },
        limits: {
          maxTokensPerRequest: 4096,
          contextWindow: 32000,
          rateLimit: 'Model-specific'
        }
      }
    ]

    // Calculate overall platform health
    const healthStats = {
      totalProviders: providers.length,
      healthyProviders: providers.filter(p => p.status === 'healthy').length,
      averageResponseTime: providers.reduce((sum, p) => sum + p.healthDetails.responseTime, 0) / providers.length,
      lastHealthCheck: new Date().toISOString(),
      uptimePercentage: 99.8 // Mock uptime percentage
    }

    return NextResponse.json({
      success: true,
      providers,
      healthStats,
      meta: {
        lastUpdated: new Date().toISOString(),
        refreshInterval: 300000, // 5 minutes in milliseconds
        version: '1.0.0'
      }
    })
  } catch (error) {
    console.error('Get providers error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}