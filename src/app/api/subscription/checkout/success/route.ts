import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Parse session_id from query parameters
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')

    if (!sessionId) {
      return NextResponse.redirect(new URL('/billing', request.url))
    }

    // Retrieve the checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'payment_intent']
    })

    if (!checkoutSession) {
      return NextResponse.redirect(new URL('/billing?error=session_not_found', request.url))
    }

    // Check if the payment was successful
    if (checkoutSession.payment_status !== 'paid') {
      return NextResponse.redirect(new URL('/billing?error=payment_failed', request.url))
    }

    // Get subscription details from the session
    const subscriptionId = checkoutSession.subscription as string
    if (!subscriptionId) {
      return NextResponse.redirect(new URL('/billing?error=subscription_not_found', request.url))
    }

    // Retrieve the subscription details
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    if (!subscription) {
      return NextResponse.redirect(new URL('/billing?error=subscription_retrieval_failed', request.url))
    }

    // Update user's subscription in our database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user) {
      return NextResponse.redirect(new URL('/billing?error=user_not_found', request.url))
    }

    // Create or update subscription record
    await prisma.subscription.upsert({
      where: { userId: session.user.id },
      update: {
        stripeSubscriptionId: subscription.id,
        tier: getTierFromStripePriceId(subscription.items.data[0]?.price?.id),
        status: subscription.status.toUpperCase() as any,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        updatedAt: new Date()
      },
      create: {
        userId: session.user.id,
        stripeSubscriptionId: subscription.id,
        tier: getTierFromStripePriceId(subscription.items.data[0]?.price?.id),
        status: subscription.status.toUpperCase() as any,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        createdAt: new Date()
      }
    })

    // Update user's subscription tier
    const newTier = getTierFromStripePriceId(subscription.items.data[0]?.price?.id)
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        subscriptionTier: newTier,
        updatedAt: new Date()
      }
    })

    // Get plan details for the response
    const plan = getPlanDetails(subscription.items.data[0]?.price?.id)

    // Create redirect URL with success message
    const redirectUrl = new URL('/billing', request.url)
    redirectUrl.searchParams.set('success', 'true')
    redirectUrl.searchParams.set('plan', plan.id)
    redirectUrl.searchParams.set('message', `Successfully subscribed to ${plan.name}!`)

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('Checkout success handler error:', error)
    const errorUrl = new URL('/billing', request.url)
    errorUrl.searchParams.set('error', 'checkout_processing_failed')

    return NextResponse.redirect(errorUrl)
  }
}

// Helper function to get tier from Stripe price ID
function getTierFromStripePriceId(priceId?: string): 'FREE' | 'PREMIUM' | 'PRO' {
  if (!priceId) return 'FREE'

  // In production, these would be actual Stripe price IDs
  const priceToTier: Record<string, 'FREE' | 'PREMIUM' | 'PRO'> = {
    'price_1PmExample999': 'PREMIUM', // Mock ID for $9.99
    'price_2PmExample1999': 'PRO', // Mock ID for $19.99
  }

  return priceToTier[priceId] || 'FREE'
}

// Helper function to get plan details
function getPlanDetails(priceId?: string) {
  const tier = getTierFromStripePriceId(priceId)

  const plans = {
    FREE: {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'usd',
      interval: 'month',
      features: ['50 messages per day', 'Access to free models', '2,000 tokens per message']
    },
    PREMIUM: {
      id: 'premium',
      name: 'Premium',
      price: 9.99,
      currency: 'usd',
      interval: 'month',
      features: ['500 messages per day', 'Access to all models', '8,000 tokens per message', 'Priority queue access']
    },
    PRO: {
      id: 'pro',
      name: 'Pro',
      price: 19.99,
      currency: 'usd',
      interval: 'month',
      features: ['Unlimited messages', 'Access to all models', '32,000 tokens per message', 'Priority support', 'Experimental features']
    }
  }

  return plans[tier] || plans.FREE
}

export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}