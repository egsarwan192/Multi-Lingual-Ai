'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Client-side type for subscription tier (instead of importing from @prisma/client)
export type SubscriptionTier = 'FREE' | 'PREMIUM' | 'PRO'

// Types for subscription state - updated to allow null values for stub implementation
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
  id: string | null
  tier: SubscriptionTier
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'EXPIRED' | null
  currentPeriodEnd: Date | null
  stripeSubscriptionId: string | null
  createdAt: Date | null
  updatedAt: Date | null
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

// Initial state for stub store - always free tier, no subscription
const initialState: SubscriptionState = {
  currentSubscription: null,
  usage: {
    messagesToday: 0,
    tokensToday: 0,
    costThisMonth: 0,
    lastResetDate: new Date()
  },
  limits: {
    dailyMessages: Number.POSITIVE_INFINITY, // Unlimited - subscriptions removed
    maxTokensPerMessage: 32000, // Max allowed - subscriptions removed
    monthlyCostLimit: Number.POSITIVE_INFINITY // No limit - subscriptions removed
  },
  isLoading: false,
  error: null,
  upgradeRecommendation: null, // No upselling - subscriptions removed
  canManageBilling: false // No billing management - subscriptions removed
}

/**
 * STUB SUBSCRIPTION STORE - Subscriptions removed
 *
 * This store maintains the same API shape as the original subscriptionStore but with
 * no-op implementations since subscriptions have been removed from the application.
 *
 * All methods return resolved promises to prevent runtime errors where components
 * attempt to call subscription methods.
 */
export const useSubscriptionStore = create<SubscriptionState & SubscriptionActions>(
  persist(
    (set, get) => ({
      ...initialState,

      // STUB: Subscriptions removed - all methods are no-ops
      getCurrentSubscription: async () => {
        // TODO: Subscriptions were removed - this is a stub implementation
        console.warn('Subscriptions removed - getCurrentSubscription() is a no-op')
        set({ currentSubscription: null, canManageBilling: false })
      },

      updateUsage: async (tokensUsed: number, cost = 0) => {
        // TODO: Subscriptions removed - usage tracking disabled
        console.warn('Subscriptions removed - updateUsage() is a no-op')
        // Still update local usage tracking for UI purposes
        try {
          const state = get()
          set({
            usage: {
              ...state.usage,
              tokensToday: state.usage.tokensToday + tokensUsed,
              costThisMonth: state.usage.costThisMonth + cost,
              lastResetDate: state.usage.lastResetDate
            }
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to update usage' })
        }
      },

      checkLimits: (messageTokens: number) => {
        // TODO: Subscriptions removed - no limits, always allow sending
        console.warn('Subscriptions removed - checkLimits() always returns true')
        return {
          canSend: true, // Always true - no limits
          reason: undefined // No reason - always allowed
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
        // TODO: Subscriptions removed - no upgrade recommendations
        console.warn('Subscriptions removed - setUpgradeRecommendation() is a no-op')
        set({ upgradeRecommendation: null })
      },

      setCanManageBilling: (canManage: boolean) => {
        // TODO: Subscriptions removed - no billing management
        console.warn('Subscriptions removed - setCanManageBilling() is a no-op')
        set({ canManageBilling: false })
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
    {
      name: 'subscription-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist basic usage stats, no subscription data
      partialize: (state) => ({
        usage: state.usage,
        limits: state.limits,
        currentSubscription: null,
        canManageBilling: false,
        upgradeRecommendation: null,
        error: null
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Always ensure no subscription state
          state.currentSubscription = null
          state.canManageBilling = false
          state.upgradeRecommendation = null
          // Ensure unlimited limits
          state.limits = {
            dailyMessages: Number.POSITIVE_INFINITY,
            maxTokensPerMessage: 32000,
            monthlyCostLimit: Number.POSITIVE_INFINITY
          }
        }
      },
    }
  )
)

// Convenience selectors - return stub values
export const useCurrentSubscription = () => null // Always null - subscriptions removed
export const useUsage = () => useSubscriptionStore(state => state.usage)
export const useLimits = () => useSubscriptionStore(state => state.limits)
export const useUpgradeRecommendation = () => null // Always null - no upselling
export const useCanManageBilling = () => false // Always false - no billing management
export const useIsSubscriptionLoading = () => useSubscriptionStore(state => state.isLoading)
export const useSubscriptionError = () => useSubscriptionStore(state => state.error)

// Derived selectors - return stub values
export const useCanSendMessage = (messageTokens: number) => {
  // Always true - no limits when subscriptions are removed
  return {
    canSend: true,
    remainingMessages: Number.POSITIVE_INFINITY,
    remainingTokens: 32000 - messageTokens
  }
}

export const useSubscriptionTier = () => {
  // Always return PRO tier equivalent (full access) when subscriptions are removed
  return 'PRO'
}

export const useIsSubscriptionActive = () => {
  // Always true - full access when subscriptions are removed
  return true
}

export const useSubscriptionDaysLeft = () => {
  // Always return 0 - no subscription when subscriptions are removed
  return 0
}

export const useMonthlyUsage = () => {
  // Still return actual usage for UI purposes, but it's not limited
  return useSubscriptionStore(state => state.usage.costThisMonth)
}

export const useDailyUsagePercentage = () => {
  // Always return 0% - no daily limits when subscriptions are removed
  return 0
}