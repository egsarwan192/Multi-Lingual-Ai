import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistOptions } from '@/lib/persistConfig'

// Client-side type for subscription tier (instead of importing from @prisma/client)
export type SubscriptionTier = 'FREE' | 'PREMIUM' | 'PRO'

// Types for auth state
export interface User {
  id: string
  email: string
  subscriptionTier: SubscriptionTier
  stripeCustomerId?: string
  createdAt: Date
  updatedAt: Date
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

export interface AuthState {
  user: User | null
  subscription: Subscription | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
}

export interface AuthActions {
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  logout: () => Promise<void>
  signup: (email: string, password: string, confirmPassword: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<void>
  refreshSubscription: () => Promise<void>
  clearError: () => void
  setInitialAuth: (user: User | null, subscription: Subscription | null) => void
}

// Initial state
const initialState: AuthState = {
  user: null,
  subscription: null,
  isLoading: false,
  isAuthenticated: false,
  error: null
}

// Create the store with persistence
export const useAuthStore = create<AuthState & AuthActions>(
  persist(
    (set, get) => ({
      ...initialState,
      // Actions
      login: async (email: string, password: string, remember = false) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, remember })
          })

          const data = await response.json()

          if (!response.ok) {
            set({ error: data.error || 'Login failed', isLoading: false })
            return
          }

          const state = get()

          // Update state with login data
          set({
            user: data.user,
            subscription: data.subscription || state.subscription,
            isLoading: false,
            isAuthenticated: true,
            error: null
          })

          // Invalidate any cached user data
          await invalidateUserCaches()
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Login failed', isLoading: false })
        }
      },

      logout: async () => {
        set({ isLoading: true })

        try {
          const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })

          if (!response.ok) {
            set({ error: 'Logout failed', isLoading: false })
            return
          }

          // Reset to initial state
          const state = get()
          set({
            ...initialState,
            user: null,
            subscription: null,
            isAuthenticated: false,
            error: null
          })

          // Clear all caches
          await clearAllCaches()
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Logout failed', isLoading: false })
        }
      },

      signup: async (email: string, password: string, confirmPassword: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, confirmPassword })
          })

          const data = await response.json()

          if (!response.ok) {
            set({ error: data.error || 'Signup failed', isLoading: false })
            return
          }

          set({
            user: data.user,
            subscription: null,
            isLoading: false,
            isAuthenticated: true,
            error: null
          })

          await invalidateUserCaches()
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Signup failed', isLoading: false })
        }
      },

      resetPassword: async (email: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          })

          const data = await response.json()

          if (!response.ok) {
            set({ error: data.error || 'Password reset failed', isLoading: false })
            return
          }

          set({ error: null, isLoading: false })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Password reset failed', isLoading: false })
        }
      },

      updateProfile: async (data: Partial<User>) => {
        try {
          const response = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          })

          const responseData = await response.json()

          if (!response.ok) {
            set({ error: responseData.error || 'Profile update failed' })
            return
          }

          const state = get()
          set({
            ...state,
            user: state.user ? { ...state.user, ...data } : null,
            updatedAt: new Date()
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Profile update failed' })
        }
      },

      refreshSubscription: async () => {
        try {
          const response = await fetch('/api/subscription/current', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          const data = await response.json()

          if (!response.ok) {
            set({ error: data.error || 'Failed to refresh subscription' })
            return
          }

          const state = get()
          set({
            ...state,
            subscription: data.subscription,
            user: data.subscription ? {
              ...state.user,
              subscriptionTier: data.subscription.current.tier
            } : state.user
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to refresh subscription' })
        }
      },

      clearError: () => set({ error: null }),

      setInitialAuth: (user: User | null, subscription: Subscription | null) => {
        set({
          user,
          subscription,
          isLoading: false,
          isAuthenticated: !!user,
          error: null
        })
      }
    }),
    persistOptions
  )
)

// Helper functions for cache management
async function invalidateUserCaches() {
  // Invalidate any React Query caches
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    // Clear user-specific localStorage items
    localStorage.removeItem('user-preferences')
    localStorage.removeItem('chat-history-cache')
    localStorage.removeItem('model-preferences')
  }

  // Trigger app-wide cache invalidation
  if (typeof window !== 'undefined' && 'dispatchEvent' in window) {
    window.dispatchEvent(new CustomEvent('auth-changed', {
      detail: { type: 'invalidate-caches' }
    }))
  }
}

async function clearAllCaches() {
  // Clear all localStorage items
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    localStorage.clear()
  }

  // Trigger complete cache clearing
  if (typeof window !== 'undefined' && 'dispatchEvent' in window) {
    window.dispatchEvent(new CustomEvent('auth-changed', {
      detail: { type: 'clear-all-caches' }
    }))
  }
}

// Selectors for easier access to state
export const useAuth = () => {
  const store = useAuthStore()
  return {
    user: store.user,
    subscription: store.subscription,
    isLoading: store.isLoading,
    isAuthenticated: store.isAuthenticated,
    error: store.error,
    isLoggedIn: () => !!store.user && store.isAuthenticated,
    hasSubscription: () => !!store.subscription,
    isSubscriptionActive: () => store.subscription?.status === 'ACTIVE',
    isPremium: () => store.subscription?.tier === 'PREMIUM',
    isPro: () => store.subscription?.tier === 'PRO',
    canAccessPremium: () => ['PREMIUM', 'PRO'].includes(store.subscription?.tier || 'FREE'),
    subscriptionDaysLeft: () => {
      if (!store.subscription || !store.subscription.currentPeriodEnd) return 0
      const now = new Date()
      const diffMs = store.subscription.currentPeriodEnd.getTime() - now.getTime()
      return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24))) // days
    }
  }
}