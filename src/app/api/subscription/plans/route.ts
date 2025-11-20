import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { subscriptionPlans } from '@/lib/stripe'
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

    // Get user's current subscription tier
    const plans = Object.values(subscriptionPlans).map(plan => ({
      ...plan,
      features: plan.features.map(feature => ({
        id: feature.toLowerCase().replace(/\s+/g, '_'),
        name: feature,
        description: getFeatureDescription(feature),
        included: true // All features in the plan are included
      })),
      pricing: {
        monthly: {
          price: plan.price,
          currency: plan.currency,
          formatted: `$${plan.price.toFixed(2)}/month`
        },
        yearly: {
          price: plan.price * 10, // 10% annual discount
          currency: plan.currency,
          formatted: `$${(plan.price * 10).toFixed(2)}/year`,
          savings: {
            amount: plan.price * 2, // Savings of 2 months free
            percentage: 16.67, // 2/12 = 16.67%
            formatted: `$${(plan.price * 2).toFixed(2)}/year savings`
          }
        }
      },
      comparison: {
        // Compare with other tiers
        betterThan: getBetterThanFeatures(plan.id),
        valueScore: calculateValueScore(plan)
      },
      limitations: getPlanLimitations(plan.id),
      recommendedFor: getRecommendedFor(plan.id)
    }))

    // Add current user context if available
    const userTier = session.user.subscriptionTier
    const userUsage = openRouterService.getUserUsage(session.user.id)
    const userLimits = openRouterService.getUsageLimits(userTier)

    // Add upgrade recommendations
    const enhancedPlans = plans.map(plan => {
      const isCurrentTier = plan.id === userTier.toLowerCase()
      const canUpgrade = canUpgradeToPlan(userTier, plan.id)

      return {
        ...plan,
        isCurrent: isCurrentTier,
        canUpgrade,
        upgradeSavings: calculateUpgradeSavings(userTier, plan.id, userUsage),
        upgradeBenefits: getUpgradeBenefits(userTier, plan.id),
        mostPopular: plan.id === 'premium', // Premium is our most popular plan
        recommendedFor: plan.id === getRecommendedPlan(userTier, userUsage)
      }
    })

    return NextResponse.json({
      success: true,
      plans: enhancedPlans,
      currentPlan: {
        id: userTier.toLowerCase(),
        name: subscriptionPlans[userTier as keyof typeof subscriptionPlans].name,
        features: subscriptionPlans[userTier as keyof typeof subscriptionPlans].features.map(feature => ({
          id: feature.toLowerCase().replace(/\s+/g, '_'),
          name: feature,
          description: getFeatureDescription(feature),
          included: true
        })),
        pricing: {
          monthly: {
            price: subscriptionPlans[userTier as keyof typeof subscriptionPlans].price,
            currency: subscriptionPlans[userTier as keyof typeof subscriptionPlans].currency,
            formatted: `$${subscriptionPlans[userTier as keyof typeof subscriptionPlans].price.toFixed(2)}/month`
          }
        }
      },
      user: {
        usage: userUsage,
        limits: userLimits,
        usagePercentage: {
          messages: userLimits.dailyMessages > 0 ? (userUsage.messagesToday / userLimits.dailyMessages) * 100 : 0,
          cost: userLimits.monthlyCostLimit > 0 ? (userUsage.costThisMonth / userLimits.monthlyCostLimit) * 100 : 0
        },
        nextReset: {
          dailyMessages: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
          monthlyCost: new Date(new Date().getFullYear(),
            new Date().getDate() === 1 ? new Date().getMonth() + 1 : new Date().getMonth() + 2,
            0
          ).toISOString()
        }
      },
      recommendations: {
        upgradeNow: userUsage.messagesToday >= userLimits.dailyMessages * 0.8,
        costOptimization: userUsage.costThisMonth >= userLimits.monthlyCostLimit * 0.7,
        bestValue: getBestValuePlan(plans),
        popular: plans.filter(p => p.mostPopular)
      },
      meta: {
        currency: 'USD',
        billingCycle: 'monthly',
        availableAddons: [], // Future feature
        taxInformation: {
          rate: 0.08, // 8% tax rate (mock)
          included: false // Prices don't include tax
        }
      }
    })
  } catch (error) {
    console.error('Get subscription plans error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get feature descriptions
function getFeatureDescription(feature: string): string {
  const descriptions: Record<string, string> = {
    '50 messages per day': 'Send up to 50 messages daily to free AI models',
    '500 messages per day': 'Send up to 500 messages daily to all AI models',
    'Unlimited messages': 'Send unlimited messages to all AI models',
    'Access to free models (GPT-3.5 Turbo, Deepseek Coder, Gemini Flash)': 'Use our free models at no cost',
    'Access to all models including GPT-4, Claude, Gemini Pro)': 'Access our complete library of AI models',
    '2,000 tokens per message': 'Maximum 2,000 tokens per message',
    '8,000 tokens per message': 'Maximum 8,000 tokens per message',
    '32,000 tokens per message': 'Maximum 32,000 tokens per message',
    'Priority queue access': 'Skip ahead of free users during high demand',
    'Email support': 'Get help via email when you need support',
    'Priority support': 'Get priority support with faster response times',
    'Custom model fine-tuning': 'Fine-tune models for your specific use cases (future)',
    'Experimental features': 'Access to experimental models and features before public release'
  }

  return descriptions[feature] || feature
}

// Get plan limitations
function getPlanLimitations(planId: string): string[] {
  const limitations: Record<string, string[]> = {
    free: [
      'Limited to free models only',
      '50 messages per day limit',
      '2,000 tokens per message limit',
      'Standard support response time'
    ],
    premium: [
      '8,000 tokens per message limit',
      '500 messages per day limit',
      'Email support only (no priority)'
    ],
    pro: [
      'None - unlimited access to all features'
    ]
  }

  return limitations[planId] || []
}

// Get features better than current plan
function getBetterThanFeatures(planId: string): string[] {
  const featureHierarchy: Record<string, string[]> = {
    free: ['Access to all models', 'Unlimited messages', 'Priority support'],
    premium: ['Custom model fine-tuning', 'Experimental features'],
    pro: [] // Pro has no limitations
  }

  return featureHierarchy[planId] || []
}

// Calculate value score for plans
function calculateValueScore(plan: any): number {
  let score = 0

  // Base score by price
  if (plan.price <= 0) {
    score += 50 // Free plan gets high score for accessibility
  } else if (plan.price <= 10) {
    score += 40 // Affordable premium
  } else {
    score += 25 // Premium/pro pricing
  }

  // Feature bonuses
  const featureCount = plan.features.length
  score += Math.min(featureCount * 2, 20) // Up to 20 points for features

  // Popularity bonus
  if (plan.id === 'premium') {
    score += 15 // Most popular plan bonus
  }

  return Math.min(100, score)
}

// Calculate upgrade savings
function calculateUpgradeSavings(currentTier: string, targetPlanId: string, usage: any): number {
  const currentPlan = subscriptionPlans[currentTier.toUpperCase() as keyof typeof subscriptionPlans]
  const targetPlan = subscriptionPlans[targetPlanId as keyof typeof subscriptionPlans]

  if (!currentPlan || !targetPlan || currentPlan.price >= targetPlan.price) {
    return 0
  }

  return Math.max(0, currentPlan.price - targetPlan.price)
}

// Get upgrade benefits
function getUpgradeBenefits(currentTier: string, targetPlanId: string): string[] {
  const currentPlan = subscriptionPlans[currentTier.toUpperCase() as keyof typeof subscriptionPlans]
  const targetPlan = subscriptionPlans[targetPlanId as keyof typeof subscriptionPlans]

  const benefits = targetPlan.features.filter(feature =>
    !currentPlan.features.includes(feature)
  )

  return benefits
}

// Get best value plan
function getBestValuePlan(plans: any[]): any {
  // Calculate value per dollar
  const plansWithValue = plans.map(plan => ({
    ...plan,
    valueScore: calculateValueScore(plan),
    valuePerDollar: plan.price > 0 ? plan.valueScore / plan.price : 0,
    featuresPerDollar: plan.price > 0 ? plan.features.length / plan.price : 0
  }))

  // Sort by value per dollar
  return plansWithValue.sort((a, b) => b.valuePerDollar - a.valuePerDollar)[0]
}

// Get recommended plan based on usage
function getRecommendedPlan(currentTier: string, usage: any): string {
  const messagesPerDay = usage.messagesToday || 10 // Default if no usage
  const costPerMonth = usage.costThisMonth || 0 // Default if no usage

  // Heavy users get Pro recommendation
  if (messagesPerDay > 400 || costPerMonth > 15) {
    return 'pro'
  }

  // Moderate users get Premium recommendation
  if (messagesPerDay > 100 || costPerMonth > 5) {
    return 'premium'
  }

  // Free users get Premium recommendation for basic usage
  if (currentTier === 'free' && messagesPerDay > 30) {
    return 'premium'
  }

  return 'free'
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}