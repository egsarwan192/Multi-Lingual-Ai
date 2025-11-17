'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useUserStore } from '@/stores/userStore'

interface Plan {
  id: 'free' | 'premium' | 'pro'
  name: string
  price: number
  interval: 'month' | 'year'
  features: string[]
  limits: {
    dailyMessages: number
    maxTokensPerMessage: number
    monthlyCostLimit: number
    availableModels: string[]
  }
  popular?: boolean
}

export default function BillingPage() {
  const router = useRouter()
  const user = useUserStore(state => state.user)
  const subscription = useUserStore(state => state.subscription)
  const isLoading = useUserStore(state => state.isLoading)

  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month')
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [usageStats, setUsageStats] = useState({
    messagesToday: 0,
    tokensUsedToday: 0,
    monthlyCost: 0,
    messagesLimit: 0
  })

  // Redirect unauthenticated users
  useEffect(() => {
    if (!user && !isLoading) {
      router.push('/')
    }
  }, [user, isLoading, router])

  // Load plans from API
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const response = await fetch('/api/subscription/plans')
        if (response.ok) {
          const data = await response.json()
          setPlans(data.plans || [])
        }
      } catch (error) {
        console.error('Failed to load plans:', error)
      }
    }

    loadPlans()
  }, [])

  // Load usage statistics
  useEffect(() => {
    const loadUsageStats = async () => {
      try {
        const response = await fetch('/api/user/usage')
        if (response.ok) {
          const data = await response.json()
          setUsageStats(data)
        }
      } catch (error) {
        console.error('Failed to load usage stats:', error)
      }
    }

    if (user) {
      loadUsageStats()
    }
  }, [user])

  // Default plans if API is not available
  const defaultPlans: Plan[] = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      interval: billingInterval,
      features: [
        '100 messages per day',
        'Basic models (GPT-3.5 Turbo, Claude-3 Haiku)',
        '10,000 tokens per message',
        'Community support'
      ],
      limits: {
        dailyMessages: 100,
        maxTokensPerMessage: 10000,
        monthlyCostLimit: 0,
        availableModels: ['gpt-3.5-turbo', 'claude-3-haiku-20240307']
      }
    },
    {
      id: 'premium',
      name: 'Premium',
      price: billingInterval === 'month' ? 20 : 200,
      interval: billingInterval,
      features: [
        '1,000 messages per day',
        'Advanced models (GPT-4, Claude-3 Sonnet, Gemini-1.5 Flash)',
        '32,000 tokens per message',
        'Priority support',
        'Chat history search',
        'Custom instructions'
      ],
      limits: {
        dailyMessages: 1000,
        maxTokensPerMessage: 32000,
        monthlyCostLimit: 100,
        availableModels: ['gpt-3.5-turbo', 'gpt-4', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'gemini-1.5-flash']
      },
      popular: true
    },
    {
      id: 'pro',
      name: 'Pro',
      price: billingInterval === 'month' ? 50 : 500,
      interval: billingInterval,
      features: [
        'Unlimited messages',
        'All models including GPT-4 Turbo, Claude-3 Opus, Gemini-1.5 Pro',
        '128,000 tokens per message',
        'Priority queue access',
        'Advanced analytics',
        'API access',
        'Priority support with SLA'
      ],
      limits: {
        dailyMessages: Infinity,
        maxTokensPerMessage: 128000,
        monthlyCostLimit: 500,
        availableModels: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'gemini-1.5-flash', 'gemini-1.5-pro', 'deepseek-chat', 'deepseek-coder']
      }
    }
  ]

  const currentPlans = plans.length > 0 ? plans : defaultPlans

  const handleSubscribe = async (planId: string) => {
    setIsUpgrading(planId)

    try {
      const response = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          interval: billingInterval
        })
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to create checkout session')
        return
      }

      const data = await response.json()

      // Redirect to Stripe Checkout
      window.location.href = data.checkoutUrl
    } catch (error) {
      alert('Failed to create checkout session')
    } finally {
      setIsUpgrading(null)
    }
  }

  const handleManageSubscription = async () => {
    try {
      const response = await fetch('/api/subscription/portal', {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to create portal session')
        return
      }

      const data = await response.json()

      // Redirect to Stripe Customer Portal
      window.location.href = data.portalUrl
    } catch (error) {
      alert('Failed to create portal session')
    }
  }

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
      return
    }

    try {
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to cancel subscription')
        return
      }

      alert('Subscription cancelled successfully')
      router.push('/settings')
    } catch (error) {
      alert('Failed to cancel subscription')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-gray-600 mt-1">Manage your subscription and payment methods</p>
        </div>

        {/* Current Status */}
        <div className="bg-white rounded-lg shadow mb-8 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Current Plan</h2>
              <p className="text-gray-600">
                {subscription ? (
                  <>
                    <span className="font-medium capitalize">{subscription.tier}</span> plan
                    <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      {subscription.status}
                    </span>
                  </>
                ) : (
                  <span className="font-medium">Free</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">
                ${subscription?.tier === 'free' ? '0' : subscription?.tier === 'premium' ? '20' : '50'}
                <span className="text-sm font-normal">/month</span>
              </p>
              {subscription?.currentPeriodEnd && (
                <p className="text-sm text-gray-600">
                  Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {/* Usage Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Messages Today</p>
              <p className="text-xl font-bold text-gray-900">
                {usageStats.messagesToday} / {usageStats.messagesLimit || '∞'}
              </p>
              <div className="mt-2 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, (usageStats.messagesToday / (usageStats.messagesLimit || 1000)) * 100)}%`
                  }}
                ></div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Tokens Used Today</p>
              <p className="text-xl font-bold text-gray-900">
                {usageStats.tokensUsedToday.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Monthly Cost</p>
              <p className="text-xl font-bold text-gray-900">
                ${usageStats.monthlyCost.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Available Models</p>
              <p className="text-xl font-bold text-gray-900">
                {subscription?.tier === 'free' ? '2' : subscription?.tier === 'premium' ? '5' : '8'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          {subscription && subscription.tier !== 'free' && (
            <div className="mt-6 flex space-x-4">
              <Button
                onClick={handleManageSubscription}
                variant="secondary"
              >
                Manage Subscription
              </Button>
              <Button
                onClick={handleCancelSubscription}
                variant="primary"
                className="bg-red-600 hover:bg-red-700"
              >
                Cancel Subscription
              </Button>
            </div>
          )}
        </div>

        {/* Billing Interval Toggle */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setBillingInterval('month')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingInterval === 'month'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingInterval('year')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingInterval === 'year'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly Billing
              <span className="ml-1 text-green-600 font-semibold">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Pricing Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {currentPlans.map((plan) => {
            const isCurrentPlan = subscription?.tier === plan.id
            const isUpgrade = subscription && (
              (subscription.tier === 'free' && plan.id !== 'free') ||
              (subscription.tier === 'premium' && plan.id === 'pro')
            )

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-lg shadow-sm border-2 ${
                  plan.popular ? 'border-blue-500' : 'border-transparent'
                } ${isCurrentPlan ? 'ring-2 ring-blue-500' : ''}`}
              >
                {plan.popular && (
                  <div className="bg-blue-500 text-white text-center py-1 text-sm font-medium rounded-t-lg">
                    Most Popular
                  </div>
                )}

                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-4xl font-bold text-gray-900">
                        ${plan.price}
                      </span>
                      <span className="text-gray-600">/{plan.interval}</span>
                    </div>
                    {billingInterval === 'year' && plan.price > 0 && (
                      <p className="text-sm text-green-600 mt-1">
                        Save ${(plan.price * 12 * 0.17).toFixed(0)} per year
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 mb-6">
                    {plan.features.map((feature, index) => (
                      <div key={index} className="flex items-start">
                        <svg className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={
                      isCurrentPlan ||
                      isUpgrading === plan.id ||
                      (isUpgrade && subscription?.status !== 'active')
                    }
                    variant={plan.popular ? "primary" : "secondary"}
                    className="w-full"
                  >
                    {isCurrentPlan ? (
                      'Current Plan'
                    ) : isUpgrade && subscription?.status !== 'active' ? (
                      'Subscription Inactive'
                    ) : isUpgrading === plan.id ? (
                      'Processing...'
                    ) : isUpgrade ? (
                      'Upgrade Now'
                    ) : (
                      'Subscribe Now'
                    )}
                  </Button>

                  {isCurrentPlan && plan.id !== 'free' && (
                    <p className="mt-2 text-sm text-gray-600 text-center">
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          handleManageSubscription()
                        }}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Manage subscription
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900">Can I change plans anytime?</h3>
              <p className="text-gray-600 mt-1">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and billing is prorated.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">What payment methods do you accept?</h3>
              <p className="text-gray-600 mt-1">
                We accept all major credit cards, debit cards, and PayPal through our secure payment processor.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Is there a free trial?</h3>
              <p className="text-gray-600 mt-1">
                Our Free plan is available indefinitely with basic features. Premium and Pro plans include a 14-day money-back guarantee.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Can I cancel anytime?</h3>
              <p className="text-gray-600 mt-1">
                Yes, you can cancel your subscription at any time. You'll continue to have access to paid features until the end of your billing period.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}