'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChatInterface } from '@/components/chat'
import { useUserStore } from '@/stores/userStore'

export default function ChatPage() {
  const router = useRouter()
  const user = useUserStore(state => state.user)
  const isLoading = useUserStore(state => state.isLoading)

  // Redirect unauthenticated users to home
  useEffect(() => {
    if (!user && !isLoading) {
      router.push('/')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // If user is not authenticated, show loading state while redirecting
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return <ChatInterface />
}