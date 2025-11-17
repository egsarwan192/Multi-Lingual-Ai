'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { Button } from '@/components/ui/Button'

interface MessageInputProps {
  className?: string
}

export function MessageInput({ className = '' }: MessageInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const sendMessage = useChatStore(state => state.sendMessage)
  const isLoading = useChatStore(state => state.isLoading)
  const currentChat = useChatStore(state => state.currentChat)
  const selectedModel = useChatStore(state => state.selectedModel)
  const error = useChatStore(state => state.error)
  const clearError = useChatStore(state => state.clearError)

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }

  // Handle message input changes
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    clearError()
    adjustTextareaHeight()
  }

  // Handle sending messages
  const handleSendMessage = async () => {
    const trimmedMessage = message.trim()

    if (!trimmedMessage) return
    if (!currentChat) {
      setMessage('Please create or select a chat first')
      return
    }
    if (!selectedModel) {
      setMessage('Please select a model first')
      return
    }

    try {
      await sendMessage(trimmedMessage)
      setMessage('')

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (error) {
      // Error is handled by the store
    }
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Get character count and max length
  const maxLength = 10000 // As defined in the API validation
  const charCount = message.length
  const isNearLimit = charCount > maxLength * 0.9
  const isAtLimit = charCount >= maxLength

  const canSend = Boolean(
    message.trim() &&
    !isLoading &&
    currentChat &&
    selectedModel &&
    !isAtLimit
  )

  return (
    <div className={`border-t bg-white p-4 ${className}`}>
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {!currentChat && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">Please create or select a chat to start messaging</p>
        </div>
      )}

      {!selectedModel && currentChat && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">Please select a model to send messages</p>
        </div>
      )}

      <div className="flex items-end space-x-3">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder={
              !currentChat
                ? 'Create or select a chat...'
                : !selectedModel
                ? 'Select a model above...'
                : 'Type your message... (Enter to send, Shift+Enter for new line)'
            }
            disabled={!currentChat || !selectedModel || isLoading}
            maxLength={maxLength}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-500"
            rows={1}
            style={{ minHeight: '40px', maxHeight: '200px' }}
          />

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-gray-500">
              {charCount} / {maxLength} characters
            </div>

            <div className="text-xs text-gray-500">
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>

          {isNearLimit && (
            <div className={`text-xs mt-1 ${isAtLimit ? 'text-red-600' : 'text-yellow-600'}`}>
              {isAtLimit ? 'Message length limit reached' : 'Approaching character limit'}
            </div>
          )}
        </div>

        <Button
          onClick={handleSendMessage}
          disabled={!canSend}
          variant="primary"
          className="px-4 py-2 whitespace-nowrap"
        >
          {isLoading ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sending...
            </div>
          ) : (
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send
            </div>
          )}
        </Button>
      </div>
    </div>
  )
}