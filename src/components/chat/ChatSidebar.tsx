'use client'

import { useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import Button from '@/components/ui/Button'
import { ChatHistoryItem } from '@/stores/chatStore'

interface ChatSidebarProps {
  className?: string
  onNewChat?: () => void
}

export function ChatSidebar({ className = '', onNewChat }: ChatSidebarProps) {
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const currentChat = useChatStore(state => state.currentChat)
  const chatHistory = useChatStore(state => state.chatHistory)
  const selectedModel = useChatStore(state => state.selectedModel)
  const isLoading = useChatStore(state => state.isLoading)
  const hasMoreHistory = useChatStore(state => state.hasMoreHistory)

  const createChat = useChatStore(state => state.createChat)
  const loadChat = useChatStore(state => state.loadChat)
  const deleteChat = useChatStore(state => state.deleteChat)
  const loadMoreHistory = useChatStore(state => state.loadMoreHistory)

  // Filter chat history based on search query
  const filteredHistory = chatHistory.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.preview.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handle creating a new chat
  const handleNewChat = async () => {
    if (!selectedModel) {
      alert('Please select a model first')
      return
    }

    setIsCreatingChat(true)
    try {
      await createChat(selectedModel.id)
      onNewChat?.()
    } catch (error) {
      // Error handled by store
    } finally {
      setIsCreatingChat(false)
    }
  }

  // Handle loading a chat
  const handleLoadChat = async (chatId: string) => {
    await loadChat(chatId)
    onNewChat?.()
  }

  // Handle deleting a chat
  const handleDeleteChat = async (chatId: string, event: React.MouseEvent) => {
    event.stopPropagation()

    if (confirm('Are you sure you want to delete this chat?')) {
      await deleteChat(chatId)
    }
  }

  // Format date for display
  const formatDate = (date: Date): string => {
    const now = new Date()
    const chatDate = new Date(date)
    const diffMs = now.getTime() - chatDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return chatDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return chatDate.toLocaleDateString([], { weekday: 'short' })
    } else {
      return chatDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  // Get model display name
  const getModelDisplayName = (provider: string, modelName: string): string => {
    const providerMap: Record<string, string> = {
      'OPENAI': 'GPT',
      'ANTHROPIC': 'Claude',
      'GOOGLE': 'Gemini',
      'DEEPSEEK': 'Deepseek'
    }
    return providerMap[provider] || modelName
  }

  // Group chats by date
  const groupChatsByDate = (chats: ChatHistoryItem[]) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    return {
      today: chats.filter(chat => new Date(chat.updatedAt) >= today),
      yesterday: chats.filter(chat => {
        const chatDate = new Date(chat.updatedAt)
        return chatDate >= yesterday && chatDate < today
      }),
      thisWeek: chats.filter(chat => {
        const chatDate = new Date(chat.updatedAt)
        return chatDate >= weekAgo && chatDate < yesterday
      }),
      older: chats.filter(chat => new Date(chat.updatedAt) < weekAgo)
    }
  }

  const groupedChats = groupChatsByDate(filteredHistory)

  return (
    <div className={`flex flex-col h-full bg-gray-50 border-r ${className}`}>
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <Button
          onClick={handleNewChat}
          disabled={!selectedModel || isCreatingChat}
          variant="primary"
          className="w-full mb-3"
        >
          {isCreatingChat ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Creating...
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </div>
          )}
        </Button>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <div className="text-sm font-medium">No chats yet</div>
            <div className="text-xs mt-1">Start your first conversation</div>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Today */}
            {groupedChats.today.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Today
                </div>
                {groupedChats.today.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={currentChat?.id === chat.id}
                    onSelect={() => handleLoadChat(chat.id)}
                    onDelete={(e) => handleDeleteChat(chat.id, e)}
                    getModelDisplayName={getModelDisplayName}
                    formatDate={formatDate}
                  />
                ))}
              </>
            )}

            {/* Yesterday */}
            {groupedChats.yesterday.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Yesterday
                </div>
                {groupedChats.yesterday.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={currentChat?.id === chat.id}
                    onSelect={() => handleLoadChat(chat.id)}
                    onDelete={(e) => handleDeleteChat(chat.id, e)}
                    getModelDisplayName={getModelDisplayName}
                    formatDate={formatDate}
                  />
                ))}
              </>
            )}

            {/* This Week */}
            {groupedChats.thisWeek.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  This Week
                </div>
                {groupedChats.thisWeek.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={currentChat?.id === chat.id}
                    onSelect={() => handleLoadChat(chat.id)}
                    onDelete={(e) => handleDeleteChat(chat.id, e)}
                    getModelDisplayName={getModelDisplayName}
                    formatDate={formatDate}
                  />
                ))}
              </>
            )}

            {/* Older */}
            {groupedChats.older.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Older
                </div>
                {groupedChats.older.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={currentChat?.id === chat.id}
                    onSelect={() => handleLoadChat(chat.id)}
                    onDelete={(e) => handleDeleteChat(chat.id, e)}
                    getModelDisplayName={getModelDisplayName}
                    formatDate={formatDate}
                  />
                ))}
              </>
            )}

            {/* Load More */}
            {hasMoreHistory && (
              <div className="p-3">
                <Button
                  onClick={loadMoreHistory}
                  disabled={isLoading}
                  variant="secondary"
                  className="w-full"
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Chat item component
interface ChatItemProps {
  chat: ChatHistoryItem
  isActive: boolean
  onSelect: () => void
  onDelete: (event: React.MouseEvent) => void
  getModelDisplayName: (provider: string, modelName: string) => string
  formatDate: (date: Date) => string
}

function ChatItem({ chat, isActive, onSelect, onDelete, getModelDisplayName, formatDate }: ChatItemProps) {
  return (
    <div
      className={`group relative px-3 py-2 cursor-pointer border-l-4 transition-colors ${
        isActive
          ? 'bg-blue-50 border-l-blue-500'
          : 'hover:bg-gray-100 border-l-transparent'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h3 className={`text-sm font-medium truncate ${
              isActive ? 'text-blue-900' : 'text-gray-900'
            }`}>
              {chat.title}
            </h3>
            <div className="flex-shrink-0">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                {getModelDisplayName(chat.modelProvider, chat.modelName)}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500 truncate mt-1">
            {chat.preview}
          </p>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-400">
              {formatDate(chat.updatedAt)}
            </span>
            <span className="text-xs text-gray-400">
              {chat.messageCount} messages
            </span>
          </div>
        </div>

        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
          title="Delete chat"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}