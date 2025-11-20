import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { subscriptionPlans } from '@/lib/stripe'
import { persistOptions } from '@/lib/persistConfig'

// Client-side type for subscription tier (instead of importing from @prisma/client)
export type SubscriptionTier = 'FREE' | 'PREMIUM' | 'PRO'

// Types for subscription state
export interface UsageLimits {
  dailyMessages: number
  maxTokensPerMessage: number
  monthlyCostLimit: number
}

export interface UsageStats {
  messagesToday: number
  tokensToday: number
  costThisMonth: number
  lastResetDate: Date
}

export interface Subscription {
  id: string
  tier: SubscriptionTier
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'EXPIRED'
  currentPeriodEnd: Date
  stripeSubscriptionId: string
  createdAt: Date
  updatedAt: Date
}

export interface SubscriptionState {
  currentSubscription: Subscription | null
  usage: UsageStats
  limits: UsageLimits
  isLoading: boolean
  error: string | null
  upgradeRecommendation: {
    tier: SubscriptionTier | null
    savings: number
    reason: string
  } | null
  canManageBilling: boolean
}

export interface SubscriptionActions {
  getCurrentSubscription: () => Promise<void>
  updateUsage: (tokensUsed: number, cost?: number) => Promise<void>
  checkLimits: (messageTokens: number) => { canSend: boolean; reason?: string }
  resetDailyUsage: () => void
  setUpgradeRecommendation: (tier: SubscriptionTier, savings: number, reason: string) => void
  setCanManageBilling: (canManage: boolean) => void
  clearUpgradeRecommendation: () => void
  setError: (error: string | null) => void
  clearError: () => void
}

// Initial state
const initialState: SubscriptionState = {
  currentSubscription: null,
  usage: {
    messagesToday: 0,
    tokensToday: 0,
    costThisMonth: 0,
    lastResetDate: new Date()
  },
  limits: {
    dailyMessages: 50,
    maxTokensPerMessage: 2000,
    monthlyCostLimit: 5.00
  },
  isLoading: false,
  error: null,
  upgradeRecommendation: null,
  canManageBilling: false
}

// Create the store with persistence
export const useSubscriptionStore = create<SubscriptionState & SubscriptionActions>(
  persist(
    (set, get) => ({
      ...initialState,

      // Actions
      getCurrentSubscription: async () => {
        set({ isLoading: true })

        try {
          const response = await fetch('/api/subscription/current', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            set({ isLoading: false })
            return
          }

          const currentLimits = getLimitsForTier(data.subscription.current.tier)
          const now = new Date()

          set({
            currentSubscription: {
              ...data.subscription.current,
              status: data.subscription.current.status
            },
            usage: data.subscription.current.usage,
            limits: currentLimits,
            isLoading: false,
            canManageBilling: data.subscription.current.status === 'ACTIVE'
          })

          // Reset daily usage if needed
          const state = get()
          if (state.usage.lastResetDate.toDateString() !== now.toDateString()) {
            set({
              usage: {
                ...state.usage,
                messagesToday: 0,
                tokensToday: 0,
                lastResetDate: now
              }
            })
          }

          // Generate upgrade recommendation
          const recommendation = generateUpgradeRecommendation(
            data.subscription.current.tier,
            state.usage,
            currentLimits
          )

          set({ upgradeRecommendation: recommendation })
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to fetch subscription' })
        }
      },

      updateUsage: async (tokensUsed: number, cost = 0) => {
        try {
          const state = get()
          const now = new Date()

          set({
            usage: {
              ...state.usage,
              tokensToday: state.usage.tokensToday + tokensUsed,
              costThisMonth: state.usage.costThisMonth + cost,
              lastResetDate: state.usage.lastResetDate
            }
          })

          // Check if user exceeded limits
          if (state.usage.tokensToday >= state.limits.maxTokensPerMessage) {
            set({
              upgradeRecommendation: {
                tier: 'PREMIUM' as SubscriptionTier,
                savings: 5.00, // Pro cost savings
                reason: 'You\'ve reached your daily token limit'
              }
            })
          } else if (state.usage.messagesToday >= state.limits.dailyMessages) {
            set({
              upgradeRecommendation: {
                tier: 'PREMIUM' as SubscriptionTier,
                savings: 5.00,
                reason: 'You\'ve reached your daily message limit'
              }
            })
          } else if (state.usage.costThisMonth >= state.limits.monthlyCostLimit * 0.9) {
            set({
              upgradeRecommendation: {
                tier: 'PREMIUM' as SubscriptionTier,
                savings: 5.00,
                reason: 'You\'re approaching your monthly cost limit'
              }
            })
          }
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to update usage' })
        }
      },

      checkLimits: (messageTokens: number) => {
        const state = get()
        const canSend =
          messageTokens <= state.limits.maxTokensPerMessage &&
          state.usage.messagesToday < state.limits.dailyMessages &&
          state.usage.costThisMonth < state.limits.monthlyCostLimit

        return {
          canSend,
          reason: !canSend ? (
            messageTokens > state.limits.maxTokensPerMessage ? 'Message exceeds token limit' :
            state.usage.messagesToday >= state.limits.dailyMessages ? 'Daily message limit reached' :
            state.usage.costThisMonth >= state.limits.monthlyCostLimit ? 'Monthly cost limit exceeded' :
            undefined
          )
        }
      },

      resetDailyUsage: () => {
        set({
          usage: {
            ...get().usage,
            messagesToday: 0,
            tokensToday: 0,
            lastResetDate: new Date()
          }
        })
      },

      setUpgradeRecommendation: (tier: SubscriptionTier, savings: number, reason: string) => {
        set({
          upgradeRecommendation: {
            tier,
            savings,
            reason
          }
        })
      },

      setCanManageBilling: (canManage: boolean) => {
        set({ canManageBilling })
      },

      clearUpgradeRecommendation: () => {
        set({ upgradeRecommendation: null })
      },

      setError: (error: string | null) => {
        set({ error })
      },

      clearError: () => {
        set({ error: null })
      }
    }),
    persistOptions
  )
)

// Helper functions
function getLimitsForTier(tier: SubscriptionTier): UsageLimits {
  switch (tier) {
    case 'FREE':
      return {
        dailyMessages: 50,
        maxTokensPerMessage: 2000,
        monthlyCostLimit: 5.00
      }
    case 'PREMIUM':
      return {
        dailyMessages: 500,
        maxTokensPerMessage: 8000,
        monthlyCostLimit: 50.00
      }
    case 'PRO':
      return {
        dailyMessages: Number.POSITIVE_INFINITY,
        maxTokensPerMessage: 32000,
        monthlyCostLimit: 250.00
      }
    default:
      return {
        dailyMessages: 50,
        maxTokensPerMessage: 2000,
        monthlyCostLimit: 5.00
      }
  }
}

function generateUpgradeRecommendation(
  currentTier: SubscriptionTier,
  usage: UsageStats,
  limits: UsageLimits
): SubscriptionState['upgradeRecommendation'] {
  // Check if upgrade is beneficial based on usage patterns
  const usagePercentage = limits.dailyMessages > 0 ? (usage.messagesToday / limits.dailyMessages) * 100 : 0
  const costPercentage = limits.monthlyCostLimit > 0 ? (usage.costThisMonth / limits.monthlyCostLimit) * 100 : 0

  // Recommend upgrade if usage is high
  if (usagePercentage > 80 || costPercentage > 80) {
    return {
      tier: currentTier === 'FREE' ? 'PREMIUM' : 'PRO',
      savings: calculateUpgradeSavings(currentTier),
      reason: usagePercentage > 80 ? 'High usage - upgrade recommended' : 'High costs - upgrade recommended'
    }
  }

  return null
}

function calculateUpgradeSavings(currentTier: SubscriptionTier): number {
  const plans = subscriptionPlans

  if (currentTier === 'FREE') {
    // Potential savings of using premium instead of pay-per-use
    return 2.50 // Mock average savings
  }

  if (currentTier === 'PREMIUM') {
    // Savings of pro vs premium
    return plans.pro.price - plans.premium.price
  }

  return 0
}

// Convenience selectors
export const useCurrentSubscription = () => useSubscriptionStore(state => state.currentSubscription)
export const useUsage = () => useSubscriptionStore(state => state.usage)
export const useLimits = () => useSubscriptionStore(state => state.limits)
export const useUpgradeRecommendation = () => useSubscriptionStore(state => state.upgradeRecommendation)
export const useCanManageBilling = () => useSubscriptionStore(state => state.canManageBilling)
export const useIsSubscriptionLoading = () => useSubscriptionStore(state => state.isLoading)
export const useSubscriptionError = () => useSubscriptionStore(state => state.error)

// Derived selectors
export const useCanSendMessage = (messageTokens: number) => {
  const { limits, usage } = useSubscriptionStore(state => ({ limits, usage }))

  return {
    canSend: messageTokens <= limits.maxTokensPerMessage && usage.messagesToday < limits.dailyMessages,
    remainingMessages: limits.dailyMessages - usage.messagesToday,
    remainingTokens: limits.maxTokensPerMessage - messageTokens
  }
}

export const useSubscriptionTier = () => {
  const { currentSubscription } = useSubscriptionStore(state => state.currentSubscription)
  return currentSubscription?.tier || 'FREE'
}

export const useIsSubscriptionActive = () => {
  const { currentSubscription } = useSubscriptionStore(state => state.currentSubscription)
  return currentSubscription?.status === 'ACTIVE'
}

export const useSubscriptionDaysLeft = () => {
  const { currentSubscription } = useSubscriptionStore(state => state.currentSubscription)

  if (!currentSubscription || !currentSubscription.currentPeriodEnd) {
    return 0
  }

  const now = new Date()
  const periodEnd = new Date(currentSubscription.currentPeriodEnd)
  const diffMs = periodEnd.getTime() - now.getTime()

  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

export const useMonthlyUsage = () => {
  const { usage } = useSubscriptionStore(state => state.usage)
  return usage.costThisMonth
}

export const useDailyUsagePercentage = () => {
  const { limits, usage } = useSubscriptionStore(state => ({ limits, usage }))

  return limits.dailyMessages > 0 ? (usage.messagesToday / limits.dailyMessages) * 100 : 0
}