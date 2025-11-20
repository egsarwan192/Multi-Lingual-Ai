import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { openRouterService } from '@/lib/llm/OpenRouterService'
import { LLMModel, Message } from '@/lib/llm/types'
import { persistOptions } from '@/lib/persistConfig'

// Client-side type for subscription tier (instead of importing from @prisma/client)
export type SubscriptionTier = 'FREE' | 'PREMIUM' | 'PRO'

// Types for chat state
export interface Chat {
  id: string
  title?: string
  modelProvider: string
  modelName: string
  createdAt: Date
  updatedAt: Date
  messageCount?: number
}

export interface ChatHistoryItem {
  id: string
  title: string
  preview: string
  modelName: string
  modelProvider: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
}

export interface ChatState {
  currentChat: Chat | null
  messages: Message[]
  isLoading: boolean
  selectedModel: LLMModel | null
  availableModels: LLMModel[]
  chatHistory: ChatHistoryItem[]
  historyPage: number
  hasMoreHistory: boolean
  streamMessage: string
  isStreaming: boolean
  error: string | null
}

export interface ChatActions {
  createChat: (modelId: string, initialMessage?: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  loadChat: (chatId: string) => Promise<void>
  deleteChat: (chatId: string) => Promise<void>
  updateChatTitle: (chatId: string, title: string) => Promise<void>
  clearMessages: () => void
  selectModel: (modelId: string) => void
  addMessage: (message: Message) => void
  setStreamingMessage: (content: string) => void
  clearStreamingMessage: () => void
  setError: (error: string | null) => void
  clearError: () => void
  loadMoreHistory: () => Promise<void>
  resetState: () => void
}

// Initial state
const initialState: ChatState = {
  currentChat: null,
  messages: [],
  isLoading: false,
  selectedModel: null,
  availableModels: [],
  chatHistory: [],
  historyPage: 1,
  hasMoreHistory: true,
  streamMessage: '',
  isStreaming: false,
  error: null
}

export const useChatStore = create<ChatState & ChatActions>(
  persist(
    (set, get) => ({
      ...initialState,
      availableModels: [],

      // Create a new chat
      createChat: async (modelId: string, initialMessage?: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch('/api/chat/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelProvider: getModelProviderFromId(modelId),
              modelName: modelId,
              initialMessage: initialMessage || 'New chat'
            })
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            set({ isLoading: false, error: data.error || 'Failed to create chat' })
            return
          }

          const newChat: Chat = {
            id: data.chat.id,
            title: data.chat.title,
            modelProvider: data.chat.modelProvider,
            modelName: data.chat.modelName,
            createdAt: data.chat.createdAt,
            updatedAt: data.chat.updatedAt
          }

          set({
            currentChat: newChat,
            messages: initialMessage ? [{
              role: 'user',
              content: initialMessage,
              timestamp: new Date()
            }] : [],
            isLoading: false
          })

          // Add to history
          const historyItem: ChatHistoryItem = {
            ...newChat,
            messageCount: 1,
            preview: initialMessage || 'New chat'
          }

          const newHistory = [historyItem, ...get().chatHistory]
          set({ chatHistory: newHistory })
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to create chat' })
        }
      },

      // Send a message
      sendMessage: async (content: string) => {
        const { currentChat, messages, selectedModel } = get()

        if (!currentChat || !selectedModel) {
          set({ error: 'No active chat or model selected' })
          return
        }

        set({ isLoading: true, error: null })

        try {
          // Add user message immediately
          const userMessage: Message = {
            role: 'user',
            content,
            timestamp: new Date()
          }

          set({ messages: [...messages, userMessage] })

          // Send to API with streaming enabled
          const response = await fetch('/api/chat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })

          if (response.body && typeof response.body.getReader === 'function') {
            // Handle streaming response
            await handleStreamingResponse(response, set)
          } else {
            // Handle non-streaming response
            const data = await response.json()

            if (!response.ok || !data.success) {
              set({
                isLoading: false,
                error: data.error || 'Failed to send message'
              })
              return
            }

            // Add assistant message
            const assistantMessage: Message = {
              role: 'assistant',
              content: data.assistantMessage.content,
              timestamp: new Date(),
              ...data.assistantMessage.usage && {
                tokenUsage: data.assistantMessage.usage
              }
            }

            set({
              messages: [...get().messages.slice(0, -1), assistantMessage],
              isLoading: false
            })
          }
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to send message'
          })
        }
      },

      // Load a specific chat
      loadChat: async (chatId: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch(`/api/chat/chats/${chatId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            set({ isLoading: false, error: data.error || 'Failed to load chat' })
            return
          }

          const loadedChat: Chat = data.chat
          set({
            currentChat: loadedChat,
            messages: data.chat.messages || [],
            isLoading: false
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to load chat'
          })
        }
      },

      // Delete a chat
      deleteChat: async (chatId: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch(`/api/chat/chats/${chatId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            set({ isLoading: false, error: data.error || 'Failed to delete chat' })
            return
          }

          // Remove from current state if it's the active chat
          const { currentChat } = get()
          if (currentChat?.id === chatId) {
            set({ currentChat: null, messages: [] })
          }

          // Remove from history
          const newHistory = get().chatHistory.filter(item => item.id !== chatId)
          set({ chatHistory: newHistory })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to delete chat'
          })
        }
      },

      // Update chat title
      updateChatTitle: async (chatId: string, title: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await fetch(`/api/chat/chats/${chatId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            set({ isLoading: false, error: data.error || 'Failed to update chat' })
            return
          }

          // Update in current state
          const { currentChat, chatHistory } = get()
          if (currentChat?.id === chatId) {
            set({
              currentChat: { ...currentChat, title },
              isLoading: false
            })
          }

          // Update in history
          const newHistory = chatHistory.map(item =>
            item.id === chatId ? { ...item, title } : item
          )
          set({ chatHistory: newHistory })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to update chat'
          })
        }
      },

      // Clear all messages
      clearMessages: () => set({ messages: [] }),

      // Select a model
      selectModel: (modelId: string) => {
        const allModels = get().availableModels
        const selectedModel = allModels.find(model => model.id === modelId)

        set({
          selectedModel,
          error: null
        })
      },

      // Add a message (for streaming responses)
      addMessage: (message: Message) => {
        const { messages } = get()
        set({ messages: [...messages, message] })
      },

      // Handle streaming message updates
      setStreamingMessage: (content: string) => {
        set({ streamMessage: content, isStreaming: true })
      },

      // Clear streaming message
      clearStreamingMessage: () => {
        set({ streamMessage: '', isStreaming: false })
      },

      // Set error state
      setError: (error: string | null) => set({ error }),

      // Clear error state
      clearError: () => set({ error: null }),

      // Load more chat history
      loadMoreHistory: async () => {
        const { historyPage, chatHistory } = get()

        if (!get().hasMoreHistory) return

        set({ isLoading: true })

        try {
          const nextPage = historyPage + 1
          const response = await fetch(`/api/chat/chats?page=${nextPage}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            set({ isLoading: false, error: data.error || 'Failed to load history' })
            return
          }

          const newHistoryItems = data.chats || []
          const newHistory = [...chatHistory, ...newHistoryItems]

          set({
            chatHistory: newHistory,
            historyPage: nextPage,
            hasMoreHistory: data.pagination.hasNext,
            isLoading: false
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to load history'
          })
        }
      },

      // Reset chat state
      resetState: () => set(initialState)
    }),
    persistOptions
  )
)

// Helper functions
function getModelProviderFromId(modelId: string): string {
  const modelMap: Record<string, string> = {
    'gpt-3.5-turbo': 'OPENAI',
    'gpt-4': 'OPENAI',
    'gpt-4-turbo': 'OPENAI',
    'claude-3-sonnet-20240229': 'ANTHROPIC',
    'claude-3-haiku-20240307': 'ANTHROPIC',
    'gemini-1.5-flash': 'GOOGLE',
    'gemini-1.5-pro': 'GOOGLE',
    'deepseek-coder': 'DEEPSEEK',
    'deepseek-chat': 'DEEPSEEK'
  }

  return modelMap[modelId] || 'OPENAI'
}

// Helper function to handle streaming responses
async function handleStreamingResponse(response: Response, set: any) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          set({ isStreaming: false })
          return
        }

        try {
          const parsed = JSON.parse(data)

          if (parsed.content) {
            set({ streamMessage: parsed.content })
          }

          if (parsed.type === 'error') {
            set({
              isStreaming: false,
              error: parsed.error
            })
            return
          }

          if (parsed.assistantMessage) {
            set({ streamMessage: '', isStreaming: false })

            const assistantMessage: Message = {
              role: 'assistant',
              content: parsed.assistantMessage.content,
              timestamp: new Date(),
              ...parsed.assistantMessage.usage && {
                tokenUsage: parsed.assistantMessage.usage
              }
            }

            set({
              messages: [...get().messages.slice(0, -1), assistantMessage]
            })
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }
}

// Convenience selectors
export const useChat = () => useChatStore()
export const useCurrentChat = () => useChatStore(state => state.currentChat)
export const useMessages = () => useChatStore(state => state.messages)
export const useSelectedModel = () => useChatStore(state => state.selectedModel)
export const useChatHistory = () => useChatStore(state => state.chatHistory)
export const useIsLoading = () => useChatStore(state => state.isLoading)
export const useIsStreaming = () => useChatStore(state => state.isStreaming)
export const useStreamMessage = () => useChatStore(state => state.streamMessage)
export const useChatError = () => useChatStore(state => state.error)

