import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getOrCreateCustomer, createCheckoutSession, subscriptionPlans } from '@/lib/stripe'
import { z } from 'zod'

// Validation schema for checkout creation
const checkoutSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
  customerEmail: z.string().email().optional(),
  promotionCode: z.string().optional()
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
    const validatedData = checkoutSchema.parse(body)
    const { planId, successUrl, cancelUrl, customerEmail, promotionCode } = validatedData

    // Validate plan exists
    const plan = subscriptionPlans[planId as keyof typeof subscriptionPlans]
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected', code: 'invalid_plan' },
        { status: 400 }
      )
    }

    // Check if user is trying to downgrade to the same plan
    if (user.subscriptionTier === planId.toUpperCase() as any) {
      return NextResponse.json(
        { error: 'You are already subscribed to this plan', code: 'already_subscribed' },
        { status: 400 }
      )
    }

    // Check for existing active subscription
    if (user.subscription && user.subscription.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'You already have an active subscription', code: 'active_subscription' },
        { status: 400 }
      )
    }

    // Validate promotion code if provided
    let discount = null
    if (promotionCode) {
      discount = await validatePromotionCode(promotionCode, planId)
      if (!discount.valid) {
        return NextResponse.json(
          { error: 'Invalid promotion code', code: 'invalid_promotion' },
          { status: 400 }
        )
      }
    }

    try {
      // Get or create Stripe customer
      const customerId = await getOrCreateCustomer(user.id, customerEmail || user.email!)

      // Create Stripe checkout session
      const checkoutSession = await createCheckoutSession(
        user.id,
        planId,
        customerEmail || user.email!,
        successUrl,
        cancelUrl
      )

      // Log conversion funnel event (for analytics)
      await logConversionEvent(user.id, planId, promotionCode, discount)

      return NextResponse.json({
        success: true,
        checkoutSession: {
          id: checkoutSession.id,
          url: checkoutSession.url,
          expiresAt: new Date(checkoutSession.expires_at * 1000).toISOString()
        },
        plan: {
          id: planId,
          name: plan.name,
          price: discount ?
            discount.amountOff > 0 ?
              Math.max(0, plan.price - discount.amountOff) :
              Math.max(0, plan.price * (1 - (discount.percentOff || 0) / 100)) :
            plan.price,
          currency: plan.currency,
          interval: plan.interval
        },
        ...(discount && {
          promotion: {
            code: promotionCode,
            amountOff: discount.amountOff,
            percentOff: discount.percentOff,
            description: discount.description
          }
        }),
        user: {
          id: user.id,
          email: user.email,
          currentTier: user.subscriptionTier
        }
      })
    } catch (error) {
      console.error('Create checkout session error:', error)
      return NextResponse.json(
        { error: 'Failed to create checkout session', code: 'checkout_failed' },
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

    console.error('Checkout creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Validate promotion code
async function validatePromotionCode(code: string, planId: string) {
  // Mock promotion code validation
  // In production, this would check against a database
  const promotionCodes = {
    'WELCOME10': { valid: true, percentOff: 10, description: '10% off your first month' },
    'STUDENT25': { valid: true, percentOff: 25, description: 'Student discount - 25% off' },
    'LAUNCH20': { valid: true, percentOff: 20, description: 'Launch promotion - 20% off' },
    'PREMIUMUP': { valid: true, amountOff: 5, description: '$5 off Premium upgrade', validPlans: ['premium'] },
    'PROSAVE': { valid: true, amountOff: 10, description: '$10 off Pro upgrade', validPlans: ['pro'] }
  }

  const promo = promotionCodes[code.toUpperCase()]

  // Check if promotion has expired (mock logic)
  const now = new Date()
  const expiredPromos = ['LAUNCH20'] // Expired after launch

  if (expiredPromos.includes(code.toUpperCase())) {
    return { valid: false }
  }

  // Check if promotion applies to this plan
  if (promo && promo.validPlans && !promo.validPlans.includes(planId)) {
    return { valid: false }
  }

  return {
    valid: promo?.valid || false,
    percentOff: promo?.percentOff || 0,
    amountOff: promo?.amountOff || 0,
    description: promo?.description || ''
  }
}

// Log conversion funnel events for analytics
async function logConversionEvent(
  userId: string,
  planId: string,
  promotionCode?: string,
  discount?: any
) {
  try {
    // In production, you would send this to your analytics service
    const event = {
      userId,
      eventType: 'checkout_initiated',
      planId,
      promotionCode,
      discount: discount ? {
        type: discount.amountOff ? 'amount' : 'percentage',
        value: discount.amountOff || discount.percentOff
      } : null,
      userAgent: 'web',
      timestamp: new Date().toISOString(),
      sessionId: crypto.randomUUID()
    }

    console.log('Conversion funnel event:', event)
    // await analytics.trackConversionEvent(event) // In production
  } catch (error) {
    console.error('Failed to log conversion event:', error)
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}