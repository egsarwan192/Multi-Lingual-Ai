import { anthropic } from '@ai-sdk/anthropic'
import { generateText, streamText } from 'ai'
import { LLMProvider, LLMModel, LLMResponse, Message, ModelProvider, APIErrorResponse } from '../types'

export class AnthropicProvider implements LLMProvider {
  name = 'Anthropic'
  private models: LLMModel[] = [
    {
      id: 'claude-3-sonnet-20240229',
      name: 'Claude 3 Sonnet',
      provider: 'ANTHROPIC' as ModelProvider,
      tier: 'premium',
      maxTokens: 4096,
      contextWindow: 200000,
      costPer1KTokens: 0.015
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      provider: 'ANTHROPIC' as ModelProvider,
      tier: 'premium',
      maxTokens: 4096,
      contextWindow: 200000,
      costPer1KTokens: 0.00025
    }
  ]

  get availableModels(): LLMModel[] {
    return this.models
  }

  async validateToken(apiKey: string): Promise<boolean> {
    try {
      const client = anthropic({
        apiKey
      })

      // Test API with a minimal request
      await client.messages.list()
      return true
    } catch (error) {
      console.error('Anthropic API validation failed:', error)
      return false
    }
  }

  estimateTokens(text: string): number {
    // Rough estimation for Claude (approximately 4 characters per token)
    // In production, you would use Anthropic's tokenizer
    return Math.ceil(text.length / 4)
  }

  async sendMessage(message: string, conversation: Message[], modelId: string): Promise<LLMResponse> {
    try {
      const client = anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      })

      const selectedModel = this.models.find(m => m.id === modelId)
      if (!selectedModel) {
        throw new Error(`Model ${modelId} not found`)
      }

      const { text, usage } = await generateText({
        model: client(modelId),
        messages: [
          ...conversation.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: 'user',
            content: message
          }
        ],
        maxTokens: selectedModel.maxTokens
      })

      return {
        content: text,
        usage: {
          promptTokens: usage?.promptTokens || 0,
          completionTokens: usage?.completionTokens || 0,
          totalTokens: usage?.totalTokens || 0
        },
        model: modelId,
        provider: 'ANTHROPIC',
        finishReason: 'stop'
      }
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  async sendMessageStream(message: string, conversation: Message[], modelId: string): Promise<ReadableStream<Uint8Array>> {
    try {
      const client = anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      })

      const selectedModel = this.models.find(m => m.id === modelId)
      if (!selectedModel) {
        throw new Error(`Model ${modelId} not found`)
      }

      const { textStream } = await streamText({
        model: client(modelId),
        messages: [
          ...conversation.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: 'user',
            content: message
          }
        ],
        maxTokens: selectedModel.maxTokens
      })

      return textStream.toReadableStream()
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  private handleError(error: any): APIErrorResponse {
    if (error?.status === 401) {
      return {
        error: 'Invalid API key',
        code: 'invalid_api_key',
        type: 'auth',
        provider: 'ANTHROPIC'
      }
    } else if (error?.status === 429) {
      return {
        error: 'Rate limit exceeded',
        code: 'rate_limit_exceeded',
        type: 'rate_limit',
        provider: 'ANTHROPIC'
      }
    } else if (error?.error?.type === 'credit') {
      return {
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        type: 'quota',
        provider: 'ANTHROPIC'
      }
    } else {
      return {
        error: error?.error?.message || error?.message || 'Unknown error occurred',
        type: 'general',
        provider: 'ANTHROPIC'
      }
    }
  }
}