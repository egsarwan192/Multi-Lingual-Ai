import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { createPortalSession, getOrCreateCustomer } from '@/lib/stripe'
import { z } from 'zod'

// Validation schema for portal access
const portalSchema = z.object({
  returnUrl: z.string().optional()
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

    // Get user from our database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        subscription: {
          select: {
            stripeSubscriptionId: true,
            status: true,
            currentPeriodEnd: true
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

    // Validate request body
    const body = await request.json()
    const validatedData = portalSchema.parse(body)
    const { returnUrl } = validatedData

    // Check if user has an active subscription
    if (!user.subscription || user.subscription.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'No active subscription found', code: 'no_active_subscription' },
        { status: 400 }
      )
    }

    try {
      // Get or create Stripe customer
      const customerId = await getOrCreateCustomer(user.id, user.email)

      // Create customer portal session
      const portalSession = await createPortalSession(
        customerId,
        returnUrl || `${process.env.NEXTAUTH_URL}/billing`
      )

      // Log portal access event
      await logPortalAccess(user.id, 'customer_portal')

      return NextResponse.json({
        success: true,
        portalUrl: portalSession.url,
        customerInfo: {
          id: customerId,
          email: user.email,
          tier: user.subscriptionTier,
          status: user.subscription.status
        },
        subscription: {
          stripeSubscriptionId: user.subscription.stripeSubscriptionId,
          tier: user.subscription.tier,
          status: user.subscription.status,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
          autoRenewal: true
        }
      })
    } catch (error) {
      console.error('Portal session creation failed:', error)
      return NextResponse.json(
        { error: 'Failed to create portal session', code: 'portal_failed' },
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

    console.error('Portal access error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Log portal access events for analytics
async function logPortalAccess(userId: string, accessType: string) {
  try {
    // In production, this would log to your analytics service
    const event = {
      userId,
      eventType: 'billing_portal_access',
      accessType,
      timestamp: new Date().toISOString(),
      userAgent: 'web'
    }

    console.log('Portal access event:', event)
    // await analytics.trackBillingEvent(event) // In production
  } catch (error) {
    console.error('Failed to log portal access:', error)
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}