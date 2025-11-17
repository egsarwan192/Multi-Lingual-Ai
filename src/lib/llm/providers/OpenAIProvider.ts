import { openai } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import { LLMProvider, LLMModel, LLMResponse, Message, ModelProvider, APIErrorResponse } from '../types'
import { Tiktoken } from 'tiktoken'

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI'
  private models: LLMModel[] = [
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'OPENAI' as ModelProvider,
      tier: 'free',
      maxTokens: 4096,
      contextWindow: 16384,
      costPer1KTokens: 0.0015
    },
    {
      id: 'gpt-4',
      name: 'GPT-4',
      provider: 'OPENAI' as ModelProvider,
      tier: 'premium',
      maxTokens: 8192,
      contextWindow: 8192,
      costPer1KTokens: 0.03
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'OPENAI' as ModelProvider,
      tier: 'premium',
      maxTokens: 4096,
      contextWindow: 128000,
      costPer1KTokens: 0.01
    }
  ]

  get availableModels(): LLMModel[] {
    return this.models
  }

  async validateToken(apiKey: string): Promise<boolean> {
    try {
      const client = openai({
        apiKey
      })

      // Test API with a minimal request
      await client('models').list()
      return true
    } catch (error) {
      console.error('OpenAI API validation failed:', error)
      return false
    }
  }

  estimateTokens(text: string): number {
    try {
      const encoder = Tiktoken.get_encoding('cl100k_base')
      const tokens = encoder.encode(text)
      encoder.free()
      return tokens.length
    } catch (error) {
      // Fallback estimation (roughly 4 chars per token)
      return Math.ceil(text.length / 4)
    }
  }

  async sendMessage(message: string, conversation: Message[], modelId: string): Promise<LLMResponse> {
    try {
      const client = openai({
        apiKey: process.env.OPENAI_API_KEY
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
        provider: 'OPENAI',
        finishReason: 'stop'
      }
    } catch (error: any) {
      if (error?.status === 401) {
        const apiError: APIErrorResponse = {
          error: 'Invalid API key',
          code: 'invalid_api_key',
          type: 'auth',
          provider: 'OPENAI'
        }
        throw apiError
      } else if (error?.status === 429) {
        const apiError: APIErrorResponse = {
          error: 'Rate limit exceeded',
          code: 'rate_limit_exceeded',
          type: 'rate_limit',
          provider: 'OPENAI'
        }
        throw apiError
      } else if (error?.status === 402) {
        const apiError: APIErrorResponse = {
          error: 'Insufficient credits',
          code: 'insufficient_credits',
          type: 'quota',
          provider: 'OPENAI'
        }
        throw apiError
      } else {
        const apiError: APIErrorResponse = {
          error: error?.message || 'Unknown error occurred',
          type: 'general',
          provider: 'OPENAI'
        }
        throw apiError
      }
    }
  }

  async sendMessageStream(message: string, conversation: Message[], modelId: string): Promise<ReadableStream<Uint8Array>> {
    try {
      const client = openai({
        apiKey: process.env.OPENAI_API_KEY
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
        provider: 'OPENAI'
      }
    } else if (error?.status === 429) {
      return {
        error: 'Rate limit exceeded',
        code: 'rate_limit_exceeded',
        type: 'rate_limit',
        provider: 'OPENAI'
      }
    } else if (error?.status === 402) {
      return {
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        type: 'quota',
        provider: 'OPENAI'
      }
    } else {
      return {
        error: error?.message || 'Unknown error occurred',
        type: 'general',
        provider: 'OPENAI'
      }
    }
  }
}