import { persist } from 'zustand/middleware'
import { StateStorage } from 'zustand/middleware'

// Custom storage adapter for localStorage with type safety
export const localStorageAdapter: StateStorage = {
  getItem: (name: string) => {
    if (typeof window !== 'undefined') {
      try {
        const item = localStorage.getItem(name)
        return item ? JSON.parse(item) : null
      } catch (error) {
        console.error('Error reading from localStorage:', error)
        return null
      }
    }
    return null
  },
  setItem: (name: string, value: any) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(name, JSON.stringify(value))
      } catch (error) {
        console.error('Error writing to localStorage:', error)
      }
    }
  },
  removeItem: (name: string) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(name)
      } catch (error) {
        console.error('Error removing from localStorage:', error)
      }
    }
  }
}

// Configuration options for persistence
export const persistOptions = {
  name: 'multillm-app-storage',
  storage: localStorageAdapter,
  partialize: (state: any) => {
    // Only persist essential user data
    const { user, subscription, chatHistory, userPreferences } = state

    return {
      user: user ? {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      } : null,
      subscription: subscription ? {
        id: subscription.id,
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt
      } : null,
      chatHistory: chatHistory ? {
        items: chatHistory.slice(0, 50), // Only persist last 50 chats
        lastAccessed: new Date().toISOString()
      } : null,
      userPreferences: userPreferences || {
        defaultModel: null,
        theme: 'system',
        notifications: {
          email: true,
          browser: true,
          newMessages: true
        },
        language: 'en',
        fontSize: 'medium'
      }
    }
  },
  onRehydrateStorage: () => (state: any) => {
    // Called after hydration
    console.log('State hydrated from localStorage')
  },
  version: 1 // Version the storage schema
}