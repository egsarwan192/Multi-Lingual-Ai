import { LLMProvider, LLMModel, LLMResponse, Message, ModelProvider, UsageLimits, UsageStats, APIErrorResponse } from './types'
import { OpenAIProvider } from './providers/OpenAIProvider'
import { AnthropicProvider } from './providers/AnthropicProvider'
import { GoogleProvider } from './providers/GoogleProvider'
import { DeepseekProvider } from './providers/DeepseekProvider'

export class OpenRouterService {
  private providers: Map<ModelProvider, LLMProvider>
  private usageTracker: Map<string, UsageStats>

  constructor() {
    this.providers = new Map()
    this.usageTracker = new Map()

    // Initialize all providers
    this.providers.set('OPENAI', new OpenAIProvider())
    this.providers.set('ANTHROPIC', new AnthropicProvider())
    this.providers.set('GOOGLE', new GoogleProvider())
    this.providers.set('DEEPSEEK', new DeepseekProvider())
  }

  getAvailableModels(): LLMModel[] {
    const allModels: LLMModel[] = []

    this.providers.forEach((provider, providerType) => {
      allModels.push(...provider.availableModels)
    })

    return allModels.sort((a, b) => {
      // Sort by provider name first, then by model name
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider)
      }
      return a.name.localeCompare(b.name)
    })
  }

  getModelsByTier(userTier: 'free' | 'premium' | 'pro'): LLMModel[] {
    const allModels = this.getAvailableModels()

    if (userTier === 'free') {
      return allModels.filter(model => model.tier === 'free')
    } else if (userTier === 'premium') {
      return allModels.filter(model => model.tier === 'free' || model.tier === 'premium')
    } else {
      return allModels // Pro has access to all models
    }
  }

  async sendMessage(
    message: string,
    conversation: Message[],
    modelId: string,
    userId?: string
  ): Promise<LLMResponse> {
    const model = this.findModelById(modelId)
    if (!model) {
      throw new Error(`Model ${modelId} not found`)
    }

    const provider = this.providers.get(model.provider)
    if (!provider) {
      throw new Error(`Provider ${model.provider} not found`)
    }

    try {
      const response = await provider.sendMessage(message, conversation, modelId)

      // Track usage if userId provided
      if (userId) {
        this.trackUsage(userId, modelId, response.usage.totalTokens, response.usage)
      }

      return response
    } catch (error) {
      throw error
    }
  }

  async sendMessageStream(
    message: string,
    conversation: Message[],
    modelId: string,
    userId?: string
  ): Promise<ReadableStream<Uint8Array>> {
    const model = this.findModelById(modelId)
    if (!model) {
      throw new Error(`Model ${modelId} not found`)
    }

    const provider = this.providers.get(model.provider)
    if (!provider) {
      throw new Error(`Provider ${model.provider} not found`)
    }

    try {
      const stream = await provider.sendMessageStream(message, conversation, modelId)
      return this.transformStreamWithUsage(stream, userId, modelId)
    } catch (error) {
      throw error
    }
  }

  async validateProviderTokens(): Promise<Map<ModelProvider, boolean>> {
    const results = new Map<ModelProvider, boolean>()

    for (const [providerType, provider] of this.providers) {
      try {
        const apiKey = this.getApiKeyForProvider(providerType)
        if (apiKey) {
          const isValid = await provider.validateToken(apiKey)
          results.set(providerType, isValid)
        } else {
          results.set(providerType, false)
        }
      } catch (error) {
        console.error(`Failed to validate ${providerType} provider:`, error)
        results.set(providerType, false)
      }
    }

    return results
  }

  estimateTokens(text: string, modelId?: string): number {
    if (modelId) {
      const model = this.findModelById(modelId)
      if (model) {
        const provider = this.providers.get(model.provider)
        if (provider) {
          return provider.estimateTokens(text)
        }
      }
    }

    // Fallback to OpenAI estimation if no model specified
    const openaiProvider = this.providers.get('OPENAI')
    return openaiProvider?.estimateTokens(text) || Math.ceil(text.length / 4)
  }

  getUsageLimits(userTier: 'free' | 'premium' | 'pro'): UsageLimits {
    switch (userTier) {
      case 'free':
        return {
          dailyMessages: 50,
          maxTokensPerMessage: 2000,
          monthlyCostLimit: 5.00
        }
      case 'premium':
        return {
          dailyMessages: 500,
          maxTokensPerMessage: 8000,
          monthlyCostLimit: 50.00
        }
      case 'pro':
        return {
          dailyMessages: Number.POSITIVE_INFINITY, // Unlimited
          maxTokensPerMessage: 32000,
          monthlyCostLimit: 250.00
        }
      default:
        throw new Error(`Invalid user tier: ${userTier}`)
    }
  }

  canSendMessage(
    userId: string,
    userTier: 'free' | 'premium' | 'pro',
    messageTokens: number
  ): { canSend: boolean; reason?: string } {
    const usage = this.getUserUsage(userId)
    const limits = this.getUsageLimits(userTier)

    // Check daily message limit
    if (usage.messagesToday >= limits.dailyMessages) {
      return {
        canSend: false,
        reason: 'Daily message limit exceeded'
      }
    }

    // Check token limit per message
    if (messageTokens > limits.maxTokensPerMessage) {
      return {
        canSend: false,
        reason: 'Message exceeds token limit'
      }
    }

    // Check monthly cost limit
    if (usage.costThisMonth >= limits.monthlyCostLimit) {
      return {
        canSend: false,
        reason: 'Monthly cost limit exceeded'
      }
    }

    return { canSend: true }
  }

  getUserUsage(userId: string): UsageStats {
    const cached = this.usageTracker.get(userId)

    if (!cached || this.shouldResetDaily(cached.lastResetDate)) {
      // Reset daily usage
      const resetStats = {
        messagesToday: 0,
        tokensToday: 0,
        costThisMonth: cached?.costThisMonth || 0,
        lastResetDate: new Date()
      }
      this.usageTracker.set(userId, resetStats)
      return resetStats
    }

    return cached
  }

  private findModelById(modelId: string): LLMModel | undefined {
    const allModels = this.getAvailableModels()
    return allModels.find(model => model.id === modelId)
  }

  private getApiKeyForProvider(provider: ModelProvider): string | undefined {
    switch (provider) {
      case 'OPENAI':
        return process.env.OPENAI_API_KEY
      case 'ANTHROPIC':
        return process.env.ANTHROPIC_API_KEY
      case 'GOOGLE':
        return process.env.GOOGLE_AI_API_KEY
      case 'DEEPSEEK':
        return process.env.DEEPSEEK_API_KEY
      default:
        return undefined
    }
  }

  private trackUsage(
    userId: string,
    modelId: string,
    tokens: number,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): void {
    const currentUsage = this.getUserUsage(userId)
    const model = this.findModelById(modelId)

    if (!model) return

    const messageCost = (tokens / 1000) * model.costPer1KTokens

    const updatedUsage: UsageStats = {
      messagesToday: currentUsage.messagesToday + 1,
      tokensToday: currentUsage.tokensToday + tokens,
      costThisMonth: currentUsage.costThisMonth + messageCost,
      lastResetDate: currentUsage.lastResetDate
    }

    this.usageTracker.set(userId, updatedUsage)
  }

  private shouldResetDaily(lastResetDate: Date): boolean {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const lastReset = new Date(lastResetDate.getFullYear(), lastResetDate.getMonth(), lastResetDate.getDate())

    return today.getTime() > lastReset.getTime()
  }

  private transformStreamWithUsage(
    stream: ReadableStream<Uint8Array>,
    userId?: string,
    modelId?: string
  ): ReadableStream<Uint8Array> {
    const model = modelId ? this.findModelById(modelId) : undefined
    let totalTokens = 0

    const reader = stream.getReader()
    const decoder = new TextDecoder()

    return new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })

            // Parse token usage from stream (implementation depends on provider format)
            // This is a simplified version - in production you'd parse the actual stream format
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') {
                  // Track final usage if userId and modelId provided
                  if (userId && model) {
                    const usage = {
                      promptTokens: Math.floor(totalTokens * 0.7), // Rough estimate
                      completionTokens: Math.floor(totalTokens * 0.3),
                      totalTokens
                    }
                    this.trackUsage(userId, modelId, totalTokens, usage)
                  }

                  controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
                  controller.close()
                  return
                }

                try {
                  const parsed = JSON.parse(data)
                  if (parsed.usage?.total_tokens) {
                    totalTokens = parsed.usage.total_tokens
                  }
                } catch (e) {
                  // Skip malformed JSON
                }
              }
            }

            controller.enqueue(value)
          }
        } catch (error) {
          controller.error(error)
        }
      }
    })
  }
}

// Singleton instance
export const openRouterService = new OpenRouterService()