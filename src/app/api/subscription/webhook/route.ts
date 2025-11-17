import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { constructWebhookEvent, getSubscriptionFromEvent, updateCustomerSubscription } from '@/lib/stripe'
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client'
import { z } from 'zod'

// Webhook event signatures we expect
const expectedEvents = [
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.created',
  'invoice.finalized',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.upcoming',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'checkout.session.completed',
  'checkout.session.expired'
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      console.error('Missing Stripe signature')
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      )
    }

    // Verify webhook signature
    let event: any
    try {
      event = constructWebhookEvent(body, signature)
    } catch (error) {
      console.error('Webhook signature verification failed:', error)
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    // Log the webhook event
    console.log(`Received webhook event: ${event.type}`, {
      id: event.id,
      created: event.created,
      data: event.data.object?.id
    })

    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event)
        break

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(event)
        break

      case 'invoice.upcoming':
        await handleUpcomingInvoice(event)
        break

      case 'checkout.session.completed':
        await handleCheckoutCompleted(event)
        break

      default:
        console.log(`Unhandled webhook event: ${event.type}`)
    }

    // Return success response
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

// Handle new subscription creation
async function handleSubscriptionCreated(event: any) {
  const subscriptionData = getSubscriptionFromEvent(event)

  if (!subscriptionData || !subscriptionData.subscriptionId) {
    console.error('Invalid subscription data in webhook event')
    return
  }

  try {
    // Find or create user record
    let user = await findUserByStripeCustomerId(subscriptionData.customerId)

    if (!user) {
      // For new subscriptions, customer might be created first
      console.log(`No user found for Stripe customer ${subscriptionData.customerId}`)
      return
    }

    // Create subscription record in our database
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        stripeSubscriptionId: subscriptionData.subscriptionId,
        tier: subscriptionData.tier,
        status: subscriptionData.status,
        currentPeriodEnd: subscriptionData.currentPeriodEnd,
        updatedAt: new Date()
      },
      create: {
        userId: user.id,
        stripeSubscriptionId: subscriptionData.subscriptionId,
        tier: subscriptionData.tier,
        status: subscriptionData.status,
        currentPeriodEnd: subscriptionData.currentPeriodEnd
      }
    })

    // Update user's subscription tier
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: subscriptionData.tier,
        updatedAt: new Date()
      }
    })

    console.log(`Subscription created for user ${user.id}: ${subscriptionData.tier}`)
  } catch (error) {
    console.error('Error handling subscription creation:', error)
  }
}

// Handle subscription updates
async function handleSubscriptionUpdated(event: any) {
  const subscriptionData = getSubscriptionFromEvent(event)

  if (!subscriptionData || !subscriptionData.subscriptionId) {
    console.error('Invalid subscription data in webhook event')
    return
  }

  try {
    // Find user by Stripe customer ID
    const user = await findUserByStripeCustomerId(subscriptionData.customerId)
    if (!user) return

    // Update subscription in our database
    await prisma.subscription.updateMany({
      where: {
        stripeSubscriptionId: subscriptionData.subscriptionId
      },
      data: {
        tier: subscriptionData.tier,
        status: subscriptionData.status,
        currentPeriodEnd: subscriptionData.currentPeriodEnd,
        updatedAt: new Date()
      }
    })

    // Update user's subscription tier if changed
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: subscriptionData.tier,
        updatedAt: new Date()
      }
    })

    console.log(`Subscription updated for user ${user.id}: ${subscriptionData.tier} (${subscriptionData.status})`)
  } catch (error) {
    console.error('Error handling subscription update:', error)
  }
}

// Handle subscription deletion/cancellation
async function handleSubscriptionDeleted(event: any) {
  const subscriptionData = getSubscriptionFromEvent(event)

  if (!subscriptionData || !subscriptionData.subscriptionId) {
    console.error('Invalid subscription data in webhook event')
    return
  }

  try {
    // Find user by Stripe customer ID
    const user = await findUserByStripeCustomerId(subscriptionData.customerId)
    if (!user) return

    // Update subscription status in our database
    await prisma.subscription.updateMany({
      where: {
        stripeSubscriptionId: subscriptionData.subscriptionId
      },
      data: {
        status: 'CANCELED',
        updatedAt: new Date()
      }
    })

    // Downgrade user to FREE tier
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: 'FREE',
        updatedAt: new Date()
      }
    })

    console.log(`Subscription canceled for user ${user.id}, downgraded to FREE`)
  } catch (error) {
    console.error('Error handling subscription deletion:', error)
  }
}

// Handle successful payments
async function handlePaymentSucceeded(event: any) {
  const invoice = event.data.object

  if (!invoice.subscription) {
    console.error('Payment succeeded webhook without subscription data')
    return
  }

  try {
    const user = await findUserByStripeCustomerId(invoice.customer)
    if (!user) return

    // Update subscription if it was previously past due
    if (invoice.billing_reason === 'subscription_create') {
      await prisma.subscription.updateMany({
        where: {
          stripeSubscriptionId: invoice.subscription
        },
        data: {
          status: 'ACTIVE',
          updatedAt: new Date()
        }
      })
    }

    console.log(`Payment succeeded for user ${user.id}: ${invoice.amount_paid / 100} USD`)
  } catch (error) {
    console.error('Error handling payment success:', error)
  }
}

// Handle failed payments
async function handlePaymentFailed(event: any) {
  const invoice = event.data.object

  try {
    const user = await findUserByStripeCustomerId(invoice.customer)
    if (!user) return

    // Update subscription to past due
    if (invoice.subscription) {
      await prisma.subscription.updateMany({
        where: {
          stripeSubscriptionId: invoice.subscription
        },
        data: {
          status: 'PAST_DUE',
          updatedAt: new Date()
        }
      })
    }

    console.log(`Payment failed for user ${user.id}: ${invoice.amount_due / 100} USD`)
  } catch (error) {
    console.error('Error handling payment failure:', error)
  }
}

// Handle upcoming invoice notifications
async function handleUpcomingInvoice(event: any) {
  const invoice = event.data.object

  try {
    const user = await findUserByStripeCustomerId(invoice.customer)
    if (!user) return

    // Log upcoming invoice for user notifications
    console.log(`Upcoming invoice for user ${user.id}: ${invoice.amount_due / 100} USD due ${new Date(invoice.due_date * 1000).toLocaleDateString()}`)

    // In production, you would send email notification here
    // await emailService.sendUpcomingInvoice(user.email, invoice)
  } catch (error) {
    console.error('Error handling upcoming invoice:', error)
  }
}

// Handle completed checkout (for user-initiated upgrades)
async function handleCheckoutCompleted(event: any) {
  const session = event.data.object

  if (!session?.metadata?.user_id || !session?.metadata?.plan_id) {
    console.error('Invalid checkout session metadata')
    return
  }

  try {
    const userId = session.metadata.user_id
    const planId = session.metadata.plan_id

    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      console.log(`Checkout session ${session.id} not paid: ${session.payment_status}`)
      return
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      console.error(`User ${userId} not found during checkout completion`)
      return
    }

    // Create subscription if this was a new subscription signup
    if (session.mode === 'subscription') {
      const subscriptionData = getSubscriptionFromEvent({
        type: 'customer.subscription.created',
        data: { object: session.subscription }
      })

      if (subscriptionData) {
        await prisma.subscription.upsert({
          where: { userId },
          update: {
            stripeSubscriptionId: subscriptionData.subscriptionId,
            tier: subscriptionData.tier,
            status: 'ACTIVE',
            currentPeriodEnd: subscriptionData.currentPeriodEnd,
            updatedAt: new Date()
          },
          create: {
            userId,
            stripeSubscriptionId: subscriptionData.subscriptionId,
            tier: subscriptionData.tier,
            status: 'ACTIVE',
            currentPeriodEnd: subscriptionData.currentPeriodEnd
          }
        })

        // Update user's tier
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: subscriptionData.tier,
            updatedAt: new Date()
          }
        })

        console.log(`Checkout completed - user ${userId} upgraded to ${subscriptionData.tier}`)
      }
    }
  } catch (error) {
    console.error('Error handling checkout completion:', error)
  }
}

// Helper function to find user by Stripe customer ID
async function findUserByStripeCustomerId(customerId: string) {
  return await prisma.user.findFirst({
    where: {
      OR: [
        { stripeCustomerId: customerId },
        // Also check subscription records for customer ID
        {
          subscription: {
            stripeSubscriptionId: customerId
          }
        }
      ]
    }
  })
}

// Add webhook signature verification to the response
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  const body = await request.text()

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    )
  }

  try {
    const event = constructWebhookEvent(body, signature)

    // ... (rest of the webhook processing logic from above)

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }
}