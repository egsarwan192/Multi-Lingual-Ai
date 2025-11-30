import Stripe from 'stripe'

// Initialize Stripe with your secret key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
})

// Subscription plans configuration
export const subscriptionPlans = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Basic access to free AI models',
    price: 0,
    currency: 'usd',
    interval: 'month',
    features: [
      '50 messages per day',
      'Access to free models (GPT-3.5 Turbo, Deepseek Coder, Gemini Flash)',
      '2,000 tokens per message',
      'Community support'
    ]
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Enhanced access to premium AI models',
    price: 999, // $9.99
    currency: 'usd',
    interval: 'month',
    features: [
      '500 messages per day',
      'Access to all models including GPT-4, Claude, Gemini Pro',
      '8,000 tokens per message',
      'Priority queue access',
      'Email support'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Unlimited access to all AI models',
    price: 1999, // $19.99
    currency: 'usd',
    interval: 'month',
    features: [
      'Unlimited messages',
      'Access to all models and experimental features',
      '32,000 tokens per message',
      'Priority queue access',
      'Priority support',
      'Custom model fine-tuning (future)'
    ]
  }
} as const

// Helper functions for Stripe operations
export async function createCheckoutSession(
  userId: string,
  planId: string,
  customerEmail?: string,
  returnToUrl?: string
) {
  try {
    const plan = subscriptionPlans[planId as keyof typeof subscriptionPlans]
    if (!plan) {
      throw new Error(`Invalid plan ID: ${planId}`)
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      billing_address_collection: 'auto',
      customer_email: customerEmail,
      success_url: `${process.env.NEXTAUTH_URL}/api/subscription/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/api/subscription/checkout/canceled`,
      line_items: [
        {
          price_data: {
            currency: plan.currency,
            product_data: {
              name: `${plan.name} Plan - Multi-LLM Platform`,
              description: plan.description,
              images: [
                {
                  src: process.env.NEXTAUTH_URL + '/api/subscription/checkout/product-image/' + planId,
                  size: '64x64'
                }
              ],
              metadata: {
                plan_id: plan.id,
                features: plan.features.join(', ')
              }
            },
            unit_amount: plan.price,
            recurring: {
              interval: plan.interval,
              interval_count: 1
            }
          },
          quantity: 1
        }
      ],
      metadata: {
        user_id: userId,
        plan_id: planId
      },
      subscription_data: {
        metadata: {
          user_id: userId
        },
        trial_settings: {
          end_behavior: 'cancel' // Don't allow trial extension
        }
      },
      allow_promotion_codes: true,
      client_reference_id: userId, // Track user
      expires_at: Math.floor(Date.now() / 1000) + 1800 // 30 minutes
    })

    return checkoutSession
  } catch (error) {
    console.error('Stripe checkout session creation failed:', error)
    throw new Error('Failed to create checkout session')
  }
}

export async function createPortalSession(customerId: string, returnUrl?: string) {
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.NEXTAUTH_URL}/billing`,
      configuration: {
        features: {
          customer_update: {
            enabled: true,
            allowed_updates: ['address', 'email', 'phone', 'tax_id']
          },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: {
            enabled: true,
            cancellation_reason: {
              enabled: true
            },
            mode: 'immediate'
          },
          subscription_update: {
            enabled: true,
            default_allowed_updates: ['price', 'promotion_code'],
            proration_behavior: 'create_prorations'
          }
        }
      }
    })

    return portalSession
  } catch (error) {
    console.error('Stripe portal session creation failed:', error)
    throw new Error('Failed to create portal session')
  }
}

export async function constructWebhookEvent(body: string, sig: string) {
  try {
    return stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    throw new Error('Invalid webhook signature')
  }
}

export async function getSubscriptionFromEvent(event: Stripe.Event) {
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const subscription = event.data.object as Stripe.Subscription
        return {
          type: event.type,
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          tier: mapPriceIdToTier(subscription.items.data[0]?.price?.id),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          previousAttributes: subscription.previous_attributes
        }

      case 'customer.subscription.deleted':
        return {
          type: event.type,
          subscriptionId: (event.data.object as Stripe.Subscription).id,
          customerId: (event.data.object as Stripe.Subscription).customer,
          status: 'canceled',
          tier: 'FREE'
        }

      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        const invoice = event.data.object as Stripe.Invoice
        return {
          type: event.type,
          customerId: invoice.customer,
          subscriptionId: invoice.subscription,
          amount: invoice.total,
          status: invoice.status,
          paymentStatus: invoice.payment_status
        }

      default:
        return {
          type: event.type,
          data: event.data.object
        }
    }
  } catch (error) {
    console.error('Error processing webhook event:', error)
    throw error
  }
}

// Helper function to map Stripe price ID to subscription tier
function mapPriceIdToTier(priceId?: string): 'FREE' | 'PREMIUM' | 'PRO' {
  if (!priceId) return 'FREE'

  // Extract price amount to determine tier
  if (priceId.includes('999')) return 'PREMIUM' // $9.99
  if (priceId.includes('1999')) return 'PRO' // $19.99
  return 'FREE'
}

// Helper function to get Stripe price ID for a plan
export function getStripePriceId(planId: string): string | null {
  const plan = subscriptionPlans[planId as keyof typeof subscriptionPlans]
  if (!plan || plan.price === 0) return null

  // In production, you would create actual Stripe prices and return their IDs
  // For now, we'll use mock price IDs
  switch (planId) {
    case 'premium':
      return 'price_1PmExample999' // Mock price ID
    case 'pro':
      return 'price_2PmExample1999' // Mock price ID
    default:
      return null
  }
}

// Helper function to create or retrieve Stripe customer
export async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  try {
    // First, try to find existing customer
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    })

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0].id
    }

    // Create new customer if doesn't exist
    const newCustomer = await stripe.customers.create({
      email,
      metadata: {
        user_id: userId,
        source: 'multillm-platform'
      }
    })

    return newCustomer.id
  } catch (error) {
    console.error('Error getting/creating Stripe customer:', error)
    throw new Error('Failed to process Stripe customer')
  }
}

// Helper function to update customer subscription
export async function updateCustomerSubscription(
  customerId: string,
  tier: 'FREE' | 'PREMIUM' | 'PRO',
  stripeSubscriptionId?: string
) {
  try {
    // Update customer metadata
    await stripe.customers.update(customerId, {
      metadata: {
        subscription_tier: tier,
        last_updated: new Date().toISOString()
      }
    })

    console.log(`Updated customer ${customerId} to tier: ${tier}`)
    return { success: true }
  } catch (error) {
    console.error('Error updating customer subscription:', error)
    throw new Error('Failed to update customer subscription')
  }
}

// Helper function to cancel subscription
export async function cancelSubscription(subscriptionId: string, immediate = true) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: !immediate ? undefined : 'now'
    })

    return {
      success: true,
      endsAt: new Date(subscription.cancel_at_period_end! * 1000)
    }
  } catch (error) {
    console.error('Error canceling subscription:', error)
    throw new Error('Failed to cancel subscription')
  }
}

// Helper function to handle payment failures
export async function handlePaymentFailure(invoiceId: string) {
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId)

    // In production, you might want to:
    // 1. Send email notification to customer
    // 2. Log the failure for analytics
    // 3. Start dunning process

    console.log(`Payment failed for invoice ${invoiceId}:`, {
      customerId: invoice.customer,
      amount: invoice.total,
      attempts: invoice.attempt_count,
      nextAttempt: invoice.next_payment_attempt
    })

    return { success: true }
  } catch (error) {
    console.error('Error handling payment failure:', error)
    throw new Error('Failed to process payment failure')
  }
}