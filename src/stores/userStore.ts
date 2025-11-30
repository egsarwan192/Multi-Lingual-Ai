import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistOptions } from '@/lib/persistConfig'

// Client-side types that match Prisma schema without importing from @prisma/client
export interface User {
  id: string
  email: string
  displayName?: string
  subscriptionTier: 'FREE' | 'PREMIUM' | 'PRO'
  createdAt: Date
  updatedAt: Date
}

export interface Subscription {
  id: string
  userId: string
  tier: 'FREE' | 'PREMIUM' | 'PRO'
  status: 'active' | 'canceled' | 'past_due' | 'incomplete'
  currentPeriodEnd?: Date
  stripeSubscriptionId?: string
  createdAt: Date
  updatedAt: Date
}

// Types for user state
export interface UserState {
  user: User | null
  subscription: Subscription | null
  isLoading: boolean
  error: string | null
}

export interface UserActions {
  setUser: (user: User) => void
  updateProfile: (updates: Partial<User>) => Promise<void>
  setSubscription: (subscription: Subscription | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  logout: () => void
  refreshUser: () => Promise<void>
  updateUsageStats: () => Promise<void>
}

// Initial state
const initialState: UserState = {
  user: null,
  subscription: null,
  isLoading: false,
  error: null
}

export const useUserStore = create<UserState & UserActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Set user
      setUser: (user: User) => {
        set({ user, error: null })
      },

      // Update user profile
      updateProfile: async (updates: Partial<User>) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to update profile')
          }

          const updatedUser = await response.json()

          set(state => ({
            user: { ...state.user!, ...updatedUser.user },
            isLoading: false
          }))
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to update profile'
          })
        }
      },

      // Set subscription
      setSubscription: (subscription: Subscription | null) => {
        set({ subscription })
      },

      // Set loading state
      setLoading: (isLoading: boolean) => {
        set({ isLoading })
      },

      // Set error
      setError: (error: string | null) => {
        set({ error })
      },

      // Clear error
      clearError: () => {
        set({ error: null })
      },

      // Logout user
      logout: () => {
        set({
          user: null,
          subscription: null,
          error: null
        })

        // Clear any client-side data that needs to be removed on logout
        if (typeof window !== 'undefined') {
          localStorage.removeItem('chatHistory')
        }
      },

      // Refresh user data
      refreshUser: async () => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch('/api/user/profile', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to refresh user data')
          }

          const { user, subscription } = await response.json()

          set({
            user,
            subscription,
            isLoading: false
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to refresh user data'
          })
        }
      },

      // Update usage statistics
      updateUsageStats: async () => {
        try {
          const response = await fetch('/api/user/usage', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          if (!response.ok) {
            console.warn('Failed to update usage stats')
            return
          }

          const stats = await response.json()

          // Update user with new usage stats if user exists
          set(state => {
            if (state.user) {
              return {
                user: {
                  ...state.user,
                  usage: stats.usage
                }
              }
            }
            return state
          })
        } catch (error) {
          console.error('Error updating usage stats:', error)
        }
      }
    }),
    persistOptions
  )
)

// Convenience selectors
export const useUser = () => useUserStore(state => state.user)
export const useSubscription = () => useUserStore(state => state.subscription)
export const useIsLoading = () => useUserStore(state => state.isLoading)
export const useUserError = () => useUserStore(state => state.error)

// Convenience actions
export const useUserActions = () => useUserStore(state => ({
  setUser: state.setUser,
  updateProfile: state.updateProfile,
  setSubscription: state.setSubscription,
  setLoading: state.setLoading,
  setError: state.setError,
  clearError: state.clearError,
  logout: state.logout,
  refreshUser: state.refreshUser,
  updateUsageStats: state.updateUsageStats
}))