import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { openRouterService } from '@/lib/llm/OpenRouterService'

// Server-side SubscriptionTier type (matches Prisma schema)
type SubscriptionTier = 'FREE' | 'PREMIUM' | 'PRO'

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

    // Get user's subscription information from our database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        createdAt: true,
        subscription: {
          select: {
            stripeSubscriptionId: true,
            tier: true,
            status: true,
            currentPeriodEnd: true,
            createdAt: true,
            updatedAt: true
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
        { error: 'User not found', code: 'user_not_found' },
        { status: 404 }
      )
    }

    // Get current usage statistics
    const currentUsage = openRouterService.getUserUsage(user.id)
    const limits = openRouterService.getUsageLimits(user.subscriptionTier)

    // Calculate usage statistics
    const usagePercentage = limits.dailyMessages > 0
      ? (currentUsage.messagesToday / limits.dailyMessages) * 100
      : 0

    const costPercentage = limits.monthlyCostLimit > 0
      ? (currentUsage.costThisMonth / limits.monthlyCostLimit) * 100
      : 0

    // Determine subscription status and remaining time
    let subscriptionStatus = user.subscription?.status || 'INACTIVE'
    let remainingTime = null
    let gracePeriodDays = 0

    if (user.subscription) {
      const now = new Date()
      const periodEnd = new Date(user.subscription.currentPeriodEnd)

      if (now >= periodEnd) {
        // Subscription has expired or is expired
        if (subscriptionStatus === 'ACTIVE') {
          gracePeriodDays = 7 // 7-day grace period
          subscriptionStatus = 'EXPIRED_GRACE'
        } else {
          subscriptionStatus = 'EXPIRED'
        }
      } else if (subscriptionStatus === 'ACTIVE') {
        const remainingMs = periodEnd.getTime() - now.getTime()
        remainingTime = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60 * 24))) // days
      }
    }

    // Generate upgrade recommendations based on usage
    const recommendations = generateSubscriptionRecommendations(
      user.subscriptionTier,
      currentUsage,
      limits,
      usagePercentage,
      costPercentage
    )

    // Prepare response data
    return NextResponse.json({
      success: true,
      subscription: {
        current: {
          tier: user.subscriptionTier,
          status: subscriptionStatus,
          stripeSubscriptionId: user.subscription?.stripeSubscriptionId,
          createdAt: user.subscription?.createdAt,
          updatedAt: user.subscription?.updatedAt,
          currentPeriodEnd: user.subscription?.currentPeriodEnd,
          gracePeriodDays,
          autoRenew: subscriptionStatus === 'ACTIVE',
          cancelAtPeriodEnd: false
        },
        features: {
          availableModels: openRouterService.getModelsByTier(user.subscriptionTier).length,
          maxTokensPerMessage: limits.maxTokensPerMessage,
          dailyMessageLimit: limits.dailyMessages,
          monthlyCostLimit: limits.monthlyCostLimit,
          prioritySupport: user.subscriptionTier === 'PRO',
          experimentalFeatures: user.subscriptionTier === 'PRO'
        }
      },
      usage: {
        current: currentUsage,
        limits: limits,
        percentages: {
          messagesUsed: Math.min(100, Math.round(usagePercentage * 100) / 100,
          costUsed: Math.min(100, Math.round(costPercentage * 100) / 100
        },
        resetTimes: {
          dailyMessages: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
          monthlyCost: user.subscription?.currentPeriodEnd ?
            new Date(user.subscription.currentPeriodEnd).toISOString() : null
        },
        remaining: remainingTime,
        stats: {
          totalChats: user._count.chats,
          averageMessagesPerDay: currentUsage.messagesToday,
          averageCostPerMonth: currentUsage.costThisMonth,
          daysInCurrentPeriod: user.subscription?.currentPeriodEnd ?
            Math.ceil((new Date(user.subscription.currentPeriodEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) :
            null
        }
      },
      billing: {
        nextBillingDate: user.subscription?.currentPeriodEnd,
        upcomingCharge: calculateUpcomingCharge(user.subscriptionTier, user.subscription?.currentPeriodEnd),
        paymentMethod: {
          type: 'card',
          brand: 'visa', // In production, get this from Stripe
          last4: '••••'
        },
        taxInformation: {
          rate: 0.08, // 8% tax rate
          location: 'US'
        }
      },
      recommendations,
      availableUpgrades: {
        premium: {
          id: 'premium',
          name: 'Premium',
          price: 9.99,
          currency: 'USD',
          features: [
            '500 messages per day',
            'Access to all AI models',
            '8,000 tokens per message',
            'Priority queue access',
            'Email support'
          ],
          savings: calculateUpgradeSavings(user.subscriptionTier, 'premium', recommendations.currentSavings)
        },
        pro: {
          id: 'pro',
          name: 'Pro',
          price: 19.99,
          currency: 'USD',
          features: [
            'Unlimited messages',
            'Access to all models + experimental',
            '32,000 tokens per message',
            'Priority support',
            'Custom model fine-tuning'
          ],
          savings: calculateUpgradeSavings(user.subscriptionTier, 'pro', recommendations.currentSavings)
        }
      },
      meta: {
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
        cacheExpiry: 60 // 1 minute cache
      }
    })
  } catch (error) {
    console.error('Get current subscription error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Generate subscription recommendations based on usage
function generateSubscriptionRecommendations(
  tier: SubscriptionTier,
  usage: any,
  limits: any,
  usagePercentage: number,
  costPercentage: number
) {
  const recommendations: any[] = []

  // Usage-based recommendations
  if (usagePercentage > 80) {
    if (tier === 'FREE') {
      recommendations.push({
        type: 'usage_upgrade',
        priority: 'high',
        title: 'High Usage - Upgrade Recommended',
        description: `You've used ${usagePercentage}% of your daily message limit`,
        action: 'Upgrade to Premium for 10x more messages',
        buttonText: 'Upgrade Now'
      })
    } else if (tier === 'PREMIUM') {
      recommendations.push({
        type: 'usage_upgrade',
        priority: 'medium',
        title: 'High Usage - Consider Pro',
        description: `You've used ${usagePercentage}% of your premium limit`,
        action: 'Upgrade to Pro for unlimited access',
        buttonText: 'Upgrade to Pro'
      })
    }
  }

  // Cost-based recommendations
  if (costPercentage > 90) {
    recommendations.push({
      type: 'cost_optimization',
      priority: 'medium',
      title: 'High Cost - Optimize Usage',
      description: `You've used ${costPercentage}% of your monthly budget`,
      action: 'Consider using more cost-effective models',
      buttonText: 'View Cost Analysis'
    })
  }

  // Time-based recommendations for expiring subscriptions
  if (usage.daysUntilReset < 3 && tier !== 'FREE') {
    recommendations.push({
      type: 'renewal_reminder',
      priority: 'low',
      title: 'Subscription Renewing Soon',
      description: `Your subscription renews in ${usage.daysUntilReset} days`,
      action: 'Manage billing preferences',
      buttonText: 'Billing Settings'
    })
  }

  // Current savings calculation
  const currentSavings = calculateCurrentSavings(tier, usage)

  return {
    currentSavings,
    hasSuggestions: recommendations.length > 0,
    suggestions: recommendations
  }
}

// Calculate upcoming charge
function calculateUpcomingCharge(tier: SubscriptionTier, periodEnd?: Date) {
  if (!periodEnd) return null

  const prices = {
    FREE: 0,
    PREMIUM: 9.99,
    PRO: 19.99
  }

  return {
    amount: prices[tier],
    currency: 'USD',
    date: periodEnd.toISOString(),
    description: `${tier} plan renewal`
  }
}

// Calculate upgrade savings
function calculateUpgradeSavings(currentTier: SubscriptionTier, upgradeTier: string, currentSavings: number) {
  if (currentTier === 'FREE') {
    if (upgradeTier === 'premium') {
      return currentSavings + 5 // Mock: $5 potential savings
    } else if (upgradeTier === 'pro') {
      return currentSavings + 15 // Mock: $15 potential savings
    }
  }

  if (currentTier === 'PREMIUM' && upgradeTier === 'pro') {
    return currentSavings + 10 // Mock: $10 potential savings
  }

  return currentSavings
}

// Calculate current savings (compared to pay-per-use)
function calculateCurrentSavings(tier: SubscriptionTier, usage: any) {
  // This would compare current subscription cost vs. pay-as-you-go pricing
  const subscriptionCosts = {
    FREE: 0,
    PREMIUM: 9.99,
    PRO: 19.99
  }

  // Mock pay-as-you-go equivalent cost
  const estimatedPayGoCost = usage.messagesToday * 0.05 + usage.costThisMonth // $0.05 per message + monthly API costs

  return Math.max(0, estimatedPayGoCost - subscriptionCosts[tier])
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}