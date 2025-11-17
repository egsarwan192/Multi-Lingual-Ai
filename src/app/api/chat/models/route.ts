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

    // Get available models for user's tier
    const availableModels = openRouterService.getModelsByTier(user.subscriptionTier)

    // Add model availability status (could be enhanced with real-time status checks)
    const modelsWithStatus = availableModels.map(model => ({
      ...model,
      status: 'available', // Could be 'busy', 'maintenance', etc.
      waitTime: null, // Estimated wait time if model is busy
      lastChecked: new Date().toISOString()
    }))

    // Get provider health information
    const providerHealth = await openRouterService.validateProviderTokens()

    return NextResponse.json({
      success: true,
      models: modelsWithStatus,
      providers: [
        {
          name: 'OpenAI',
          providerType: 'OPENAI',
          status: providerHealth.get('OPENAI') ? 'healthy' : 'error',
          lastChecked: new Date().toISOString()
        },
        {
          name: 'Anthropic',
          providerType: 'ANTHROPIC',
          status: providerHealth.get('ANTHROPIC') ? 'healthy' : 'error',
          lastChecked: new Date().toISOString()
        },
        {
          name: 'Google',
          providerType: 'GOOGLE',
          status: providerHealth.get('GOOGLE') ? 'healthy' : 'error',
          lastChecked: new Date().toISOString()
        },
        {
          name: 'Deepseek',
          providerType: 'DEEPSEEK',
          status: providerHealth.get('DEEPSEEK') ? 'healthy' : 'error',
          lastChecked: new Date().toISOString()
        }
      ],
      filters: {
        tiers: ['free', 'premium'],
        providers: ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'DEEPSEEK']
      },
      userTier: user.subscriptionTier
    })
  } catch (error) {
    console.error('Get models error:', error)
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