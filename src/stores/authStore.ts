'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Client-side type definitions (no @prisma/client imports)
export type SubscriptionTier = 'FREE' | 'PREMIUM' | 'PRO'

// Types for auth state - updated to allow null values for stub implementation
export interface User {
  id: string | null
  email: string | null
  subscriptionTier: SubscriptionTier
  stripeCustomerId?: string | null
  createdAt: Date | null
  updatedAt: Date | null
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

// Initial state for stub store - always unauthenticated
const initialState: AuthState = {
  user: null,
  subscription: null,
  isLoading: false,
  isAuthenticated: false,
  error: null
}

/**
 * STUB AUTH STORE - Authentication removed
 *
 * This store maintains the same API shape as the original authStore but with
 * no-op implementations since authentication has been removed from the application.
 *
 * All methods return resolved promises to prevent runtime errors where components
 * attempt to call auth methods.
 */
export const useAuthStore = create<AuthState & AuthActions>(
  persist(
    (set, get) => ({
      ...initialState,

      // STUB: Authentication removed - all methods are no-ops
      login: async (email: string, password: string, remember = false) => {
        // TODO: Authentication was removed - this is a stub implementation
        console.warn('Authentication removed - login() is a no-op')
        set({ error: 'Authentication removed' })
      },

      logout: async () => {
        // TODO: Authentication was removed - this is a stub implementation
        console.warn('Authentication removed - logout() is a no-op')
        set({ user: null, subscription: null, isAuthenticated: false })
      },

      signup: async (email: string, password: string, confirmPassword: string) => {
        // TODO: Authentication was removed - this is a stub implementation
        console.warn('Authentication removed - signup() is a no-op')
        set({ error: 'Authentication removed' })
      },

      resetPassword: async (email: string) => {
        // TODO: Authentication was removed - this is a stub implementation
        console.warn('Authentication removed - resetPassword() is a no-op')
        set({ error: 'Authentication removed' })
      },

      updateProfile: async (data: Partial<User>) => {
        // TODO: Authentication was removed - this is a stub implementation
        console.warn('Authentication removed - updateProfile() is a no-op')
      },

      refreshSubscription: async () => {
        // TODO: Authentication removed - subscription management disabled
        console.warn('Authentication removed - refreshSubscription() is a no-op')
        set({ subscription: null })
      },

      clearError: () => {
        set({ error: null })
      },

      setInitialAuth: (user: User | null, subscription: Subscription | null) => {
        // TODO: Authentication removed - always set to unauthenticated state
        set({ user: null, subscription: null, isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist the unauthenticated state
      partialize: (state) => ({
        user: null,
        subscription: null,
        isAuthenticated: false,
        error: null
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Always ensure unauthenticated state
          state.user = null
          state.subscription = null
          state.isAuthenticated = false
        }
      },
    }
  )
)

// Selectors for easier access to state - return stub values
export const useAuth = () => {
  const store = useAuthStore()
  return {
    user: store.user,
    subscription: store.subscription,
    isLoading: store.isLoading,
    isAuthenticated: false, // Always false - auth removed
    error: store.error,
    isLoggedIn: () => false, // Always false - auth removed
    hasSubscription: () => false, // Always false - auth removed
    isSubscriptionActive: () => false, // Always false - auth removed
    isPremium: () => false, // Always false - auth removed
    isPro: () => false, // Always false - auth removed
    canAccessPremium: () => false, // Always false - auth removed
    subscriptionDaysLeft: () => 0 // Always 0 - auth removed
  }
}

// Convenience selectors (return stub values)
export const useUser = () => null // Always null - auth removed
export const useSubscription = () => null // Always null - auth removed
export const useIsAuthenticated = () => false // Always false - auth removed
export const useIsLoading = () => useAuthStore(state => state.isLoading)
export const useAuthError = () => useAuthStore(state => state.error)