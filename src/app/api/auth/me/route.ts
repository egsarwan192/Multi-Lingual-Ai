import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getSession } from '@/lib/supabase/server'
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

    // Get user from our database with related data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        createdAt: true,
        subscription: {
          select: {
            tier: true,
            status: true,
            currentPeriodEnd: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            chats: true
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User profile not found', code: 'profile_not_found' },
        { status: 404 }
      )
    }

    // Get user's current usage statistics
    const usage = openRouterService.getUserUsage(user.id)
    const limits = openRouterService.getUsageLimits(user.subscriptionTier)

    // Get available models for user's tier
    const availableModels = openRouterService.getModelsByTier(user.subscriptionTier)

    // Return comprehensive user data
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscription: user.subscription,
        createdAt: user.createdAt,
        stats: {
          totalChats: user._count.chats,
          usage: {
            messagesToday: usage.messagesToday,
            tokensToday: usage.tokensToday,
            costThisMonth: usage.costThisMonth,
            lastResetDate: usage.lastResetDate
          },
          limits: {
            dailyMessages: limits.dailyMessages,
            maxTokensPerMessage: limits.maxTokensPerMessage,
            monthlyCostLimit: limits.monthlyCostLimit
          }
        },
        features: {
          availableModels,
          canSendMessage: usage.messagesToday < limits.dailyMessages,
          canUpgrade: user.subscriptionTier !== 'PRO'
        }
      }
    })
  } catch (error) {
    console.error('Get user info error:', error)
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