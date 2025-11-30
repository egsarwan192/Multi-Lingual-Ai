'use client'

import { useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { Message } from '@/lib/llm/types'

interface MessageListProps {
  className?: string
}

export function MessageList({ className = '' }: MessageListProps) {
  const messages = useChatStore(state => state.messages)
  const isStreaming = useChatStore(state => state.isStreaming)
  const streamMessage = useChatStore(state => state.streamMessage)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamMessage])

  const formatTimestamp = (timestamp?: Date): string => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getMessageRoleColor = (role: string): string => {
    switch (role) {
      case 'user':
        return 'bg-blue-50 border-blue-200 text-blue-900'
      case 'assistant':
        return 'bg-gray-50 border-gray-200 text-gray-900'
      case 'system':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-900'
    }
  }

  const getMessageRoleLabel = (role: string): string => {
    switch (role) {
      case 'user':
        return 'You'
      case 'assistant':
        return 'Assistant'
      case 'system':
        return 'System'
      default:
        return role
    }
  }

  const formatContent = (content: string): string => {
    // Basic markdown-like formatting for common patterns
    return content
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 p-2 rounded overflow-x-auto text-sm"><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />')
  }

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className={`flex items-center justify-center h-full text-gray-500 ${className}`}>
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Start a conversation</div>
          <div className="text-sm">Choose a model and send your first message</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col space-y-4 p-4 overflow-y-auto ${className}`}>
      {messages.map((message, index) => (
        <div
          key={index}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-lg border p-3 ${getMessageRoleColor(message.role)}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm">
                {getMessageRoleLabel(message.role)}
              </div>
              {message.timestamp && (
                <div className="text-xs opacity-75">
                  {formatTimestamp(message.timestamp)}
                </div>
              )}
            </div>

            <div
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
            />

            {message.tokenUsage && (
              <div className="mt-2 pt-2 border-t border-current opacity-50">
                <div className="text-xs">
                  Tokens: {message.tokenUsage.totalTokens}
                  {message.tokenUsage.inputTokens && ` (${message.tokenUsage.inputTokens} in)`}
                  {message.tokenUsage.outputTokens && ` / ${message.tokenUsage.outputTokens} out)`}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {isStreaming && streamMessage && (
        <div className="flex justify-start">
          <div className={`max-w-[80%] rounded-lg border p-3 ${getMessageRoleColor('assistant')}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm">
                {getMessageRoleLabel('assistant')}
              </div>
              <div className="text-xs opacity-75">
                <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span>
              </div>
            </div>

            <div
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: formatContent(streamMessage) }}
            />
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}