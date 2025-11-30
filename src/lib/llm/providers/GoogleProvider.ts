import { google } from '@ai-sdk/google'
import { generateText, streamText } from 'ai'
import { LLMProvider, LLMModel, LLMResponse, Message, ModelProvider, APIErrorResponse } from '../types'

export class GoogleProvider implements LLMProvider {
  name = 'Google'
  private models: LLMModel[] = [
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini Flash',
      provider: 'GOOGLE' as ModelProvider,
      tier: 'free',
      maxTokens: 8192,
      contextWindow: 1000000,
      costPer1KTokens: 0.000125
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini Pro',
      provider: 'GOOGLE' as ModelProvider,
      tier: 'premium',
      maxTokens: 8192,
      contextWindow: 2000000,
      costPer1KTokens: 0.0025
    }
  ]

  get availableModels(): LLMModel[] {
    return this.models
  }

  async validateToken(apiKey: string): Promise<boolean> {
    try {
      const client = google({
        apiKey
      })

      // Test API with a minimal request
      await client('models').list()
      return true
    } catch (error) {
      console.error('Google AI API validation failed:', error)
      return false
    }
  }

  estimateTokens(text: string): number {
    // Rough estimation for Gemini (approximately 4 characters per token)
    // In production, you would use Google's tokenizer
    return Math.ceil(text.length / 4)
  }

  async sendMessage(message: string, conversation: Message[], modelId: string): Promise<LLMResponse> {
    try {
      const client = google({
        apiKey: process.env.GOOGLE_AI_API_KEY
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
        provider: 'GOOGLE',
        finishReason: 'stop'
      }
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  async sendMessageStream(message: string, conversation: Message[], modelId: string): Promise<ReadableStream<Uint8Array>> {
    try {
      const client = google({
        apiKey: process.env.GOOGLE_AI_API_KEY
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
    if (error?.status === 401 || error?.status === 403) {
      return {
        error: 'Invalid API key',
        code: 'invalid_api_key',
        type: 'auth',
        provider: 'GOOGLE'
      }
    } else if (error?.status === 429) {
      return {
        error: 'Rate limit exceeded',
        code: 'rate_limit_exceeded',
        type: 'rate_limit',
        provider: 'GOOGLE'
      }
    } else if (error?.error?.code === 'RESOURCE_EXHAUSTED') {
      return {
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        type: 'quota',
        provider: 'GOOGLE'
      }
    } else {
      return {
        error: error?.error?.message || error?.message || 'Unknown error occurred',
        type: 'general',
        provider: 'GOOGLE'
      }
    }
  }
}