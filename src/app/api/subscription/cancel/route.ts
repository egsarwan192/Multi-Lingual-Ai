import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { cancelSubscription } from '@/lib/stripe'
import { z } from 'zod'

// Validation schema for cancellation
const cancelSchema = z.object({
  reason: z.string().optional(),
  immediate: z.boolean().optional().default(false),
  feedback: z.string().optional(),
  offerId: z.string().optional() // For retention offers
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

    // Get user's subscription information
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        subscriptionTier: true,
        subscription: {
          select: {
            stripeSubscriptionId: true,
            tier: true,
            status: true,
            currentPeriodEnd: true
          }
        }
      }
    })

    if (!user || !user.subscription) {
      return NextResponse.json(
        { error: 'No active subscription found', code: 'no_subscription' },
        { status: 404 }
      )
    }

    // Validate request body
    const body = await request.json()
    const validatedData = cancelSchema.parse(body)
    const { reason, immediate, feedback, offerId } = validatedData

    // Check if subscription is already canceled
    if (user.subscription.status === 'CANCELED') {
      return NextResponse.json(
        { error: 'Subscription is already canceled', code: 'already_canceled' },
        { status: 400 }
      )
    }

    // Check if immediate cancellation is allowed for current tier
    if (!immediate && user.subscriptionTier !== 'PRO') {
      // Only Pro users can cancel without immediate effect
      const gracePeriodEnd = new Date(
        user.subscription.currentPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000
      )

      return NextResponse.json(
        { error: 'Immediate cancellation requires Pro tier', code: 'immediate_not_allowed' },
        {
          status: 400,
          details: {
            currentTier: user.subscriptionTier,
            gracePeriodEnd: gracePeriodEnd.toISOString(),
            message: 'Your access will continue until the end of your current billing period'
          }
        }
      )
    }

    try {
      // Process cancellation with Stripe
      const cancelResult = await cancelSubscription(user.subscription.stripeSubscriptionId, immediate)

      // Update our database
      await prisma.subscription.update({
        where: { stripeSubscriptionId: user.subscription.stripeSubscriptionId },
        data: {
          status: 'CANCELED',
          updatedAt: new Date()
        }
      })

      // Downgrade user to FREE tier
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          subscriptionTier: 'FREE',
          updatedAt: new Date()
        }
      })

      // Log cancellation event
      await logCancellationEvent(
        session.user.id,
        user.email,
        user.subscriptionTier,
        reason,
        feedback,
        immediate
      )

      return NextResponse.json({
        success: true,
        cancellation: {
          subscriptionId: user.subscription.stripeSubscriptionId,
          effectiveImmediately: immediate,
          accessUntil: user.subscription.currentPeriodEnd.toISOString(),
          refund: false, // No refunds for unused portions
          reason: reason || 'User requested cancellation'
        },
        offers: processRetentionOffers(user.subscriptionTier, immediate),
        support: {
          canContact: true,
          contactMethods: ['email', 'support_portal'],
          retentionOffers: generateRetentionOffers(user.subscriptionTier)
        },
        nextSteps: immediate ? [
          'Your access has been terminated immediately',
          'You can resubscribe at any time'
        ] : [
          'Your access will continue until the end of your current billing period',
          `You have access until ${new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}`,
          'You can resubscribe before your access expires'
        ]
      })
    } catch (error) {
      console.error('Subscription cancellation error:', error)
      return NextResponse.json(
        { error: 'Failed to process cancellation', code: 'cancellation_failed' },
        { status: 500 }
      )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Cancel subscription error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Generate retention offers to prevent cancellation
function processRetentionOffers(currentTier: string, immediate: boolean): any[] {
  const offers: any[] = []

  if (!immediate) {
    // Offer pause instead of cancellation
    offers.push({
      id: 'pause_subscription',
      title: 'Pause Your Subscription',
      description: 'Keep your subscription paused for up to 3 months',
      value: 'Freeze your access and return anytime',
      buttonText: 'Pause Instead',
      discount: 50 // 50% off while paused
    })

    // Offer discount to stay
    offers.push({
      id: 'discount_retention',
      title: 'Stay With Us - Special Offer',
      description: `Get 20% off your next 3 months if you keep your ${currentTier} plan`,
      value: 'Limited time offer to continue your subscription',
      buttonText: 'Get Discount',
      discount: 20,
      duration: '3_months'
    })
  }

  // Offer downgrade instead of cancellation
  if (currentTier === 'PRO') {
    offers.push({
      id: 'downgrade_instead',
      title: 'Downgrade to Premium',
      description: 'Keep your access for less with our Premium plan',
      value: 'Maintain access at a lower cost',
      buttonText: 'Downgrade to Premium',
      savings: 10 // $10/month savings
    })
  }

  return offers
}

// Generate retention offers data
function generateRetentionOffers(currentTier: string): any[] {
  return [
    {
      type: 'discount',
      title: 'Special Offer - Stay With Us',
      description: 'We would like to offer you a special discount to continue using our service',
      offer: {
        discount: 25, // 25% off next 3 months
        duration: '3_months',
        code: 'STAY25',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      contactOption: 'Chat with our support team to activate this offer'
    },
    {
      type: 'upgrade_incentive',
      title: 'Upgrade to Pro and Save',
      description: 'Lock in current pricing with an upgrade to our Pro plan',
      offer: {
        discount: 15, // 15% off first year of Pro
        duration: '1_year',
        code: 'PROSAVE15',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      },
      contactOption: 'Upgrade now to lock in current pricing forever'
    }
  ]
}

// Log cancellation event for analytics
async function logCancellationEvent(
  userId: string,
  email: string,
  tier: string,
  reason?: string,
  feedback?: string,
  immediate: boolean
) {
  try {
    // In production, this would log to your analytics service
    const event = {
      userId,
      email,
      tier,
      reason,
      feedback,
      immediate,
      eventType: 'subscription_canceled',
      timestamp: new Date().toISOString(),
      userAgent: 'web',
      sessionId: crypto.randomUUID()
    }

    console.log('Cancellation event:', event)
    // await analytics.trackEvent(event) // In production
  } catch (error) {
    console.error('Failed to log cancellation event:', error)
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}