'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useUserStore } from '@/stores/userStore'
import { ModelSelector } from './ModelSelector'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ChatSidebar } from './ChatSidebar'

interface ChatInterfaceProps {
  className?: string
}

export function ChatInterface({ className = '' }: ChatInterfaceProps) {
  const currentChat = useChatStore(state => state.currentChat)
  const availableModels = useChatStore(state => state.availableModels)
  const selectModel = useChatStore(state => state.selectModel)
  const loadChatHistory = useChatStore(state => state.loadMoreHistory)
  const availableModelsLoaded = useChatStore(state => state.availableModels.length > 0)

  const user = useUserStore(state => state.user)
  const subscriptionTier = useUserStore(state => state.subscriptionTier)

  // Initialize available models based on user's subscription tier
  useEffect(() => {
    if (user && subscriptionTier && !availableModelsLoaded) {
      import('@/lib/llm/OpenRouterService').then(({ openRouterService }) => {
        const models = openRouterService.getModelsByTier(subscriptionTier)
        useChatStore.setState({ availableModels: models })

        // Auto-select first available model
        if (models.length > 0 && !useChatStore.getState().selectedModel) {
          selectModel(models[0].id)
        }
      })
    }
  }, [user, subscriptionTier, availableModelsLoaded, selectModel])

  // Load initial chat history
  useEffect(() => {
    if (user && !useChatStore.getState().chatHistory.length) {
      loadChatHistory()
    }
  }, [user, loadChatHistory])

  const handleNewChat = () => {
    // Focus on message input after creating new chat
    setTimeout(() => {
      const messageInput = document.querySelector('textarea')
      if (messageInput) {
        messageInput.focus()
      }
    }, 100)
  }

  return (
    <div className={`flex h-screen bg-white ${className}`}>
      {/* Sidebar */}
      <ChatSidebar
        className="w-80 flex-shrink-0"
        onNewChat={handleNewChat}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {currentChat ? (
          <>
            {/* Chat Header */}
            <div className="flex-shrink-0 border-b bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold text-gray-900 truncate">
                    {currentChat.title || 'New Chat'}
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    {currentChat.modelProvider} • {currentChat.modelName}
                  </p>
                </div>

                <ModelSelector className="w-64" />
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 flex flex-col min-h-0">
              <MessageList className="flex-1" />
              <MessageInput />
            </div>
          </>
        ) : (
          // Welcome Screen
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-lg w-full mx-auto px-6">
              <div className="text-center">
                <div className="mb-8">
                  <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h2 className="mt-4 text-2xl font-bold text-gray-900">
                    Welcome to Multi-LLM Platform
                  </h2>
                  <p className="mt-2 text-gray-600">
                    Start a conversation with advanced AI models from multiple providers
                  </p>
                </div>

                <div className="text-left bg-gray-50 rounded-lg p-6">
                  <h3 className="font-medium text-gray-900 mb-4">Getting Started:</h3>
                  <ol className="space-y-3 text-sm text-gray-600">
                    <li className="flex items-start">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                        1
                      </span>
                      <span>Select a model from the dropdown above</span>
                    </li>
                    <li className="flex items-start">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                        2
                      </span>
                      <span>Click "New Chat" to start a conversation</span>
                    </li>
                    <li className="flex items-start">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                        3
                      </span>
                      <span>Type your message and press Enter to send</span>
                    </li>
                  </ol>
                </div>

                {/* Model Selection Preview */}
                <div className="mt-6">
                  <ModelSelector />
                </div>

                {/* Available Models Info */}
                {availableModels.length > 0 && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800 font-medium mb-2">
                      {availableModels.length} models available for your {subscriptionTier} tier
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {availableModels.slice(0, 4).map((model) => (
                        <span
                          key={model.id}
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {model.name}
                        </span>
                      ))}
                      {availableModels.length > 4 && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          +{availableModels.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {availableModels.length === 0 && user && (
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      No models available for your subscription tier.
                      <a href="/settings/billing" className="font-medium underline ml-1">
                        Upgrade your plan
                      </a> to access more models.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}