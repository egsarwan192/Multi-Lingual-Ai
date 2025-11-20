// ModelProvider type (matches Prisma schema)
export type ModelProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'DEEPSEEK'

export interface LLMProvider {
  name: string
  availableModels: LLMModel[]
  sendMessage(message: string, conversation: Message[], modelId: string): Promise<LLMResponse>
  sendMessageStream(message: string, conversation: Message[], modelId: string): Promise<ReadableStream<Uint8Array>>
  validateToken(apiKey: string): Promise<boolean>
  estimateTokens(text: string): number
}

export interface LLMModel {
  id: string
  name: string
  provider: ModelProvider
  tier: 'free' | 'premium'
  maxTokens: number
  contextWindow: number
  costPer1KTokens: number
}

export interface LLMResponse {
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model: string
  provider: ModelProvider
  finishReason: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: Date
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface UsageLimits {
  dailyMessages: number
  maxTokensPerMessage: number
  monthlyCostLimit: number
}

export interface UsageStats {
  messagesToday: number
  tokensToday: number
  costThisMonth: number
  lastResetDate: Date
}

export interface APIErrorResponse {
  error: string
  code?: string
  type: 'rate_limit' | 'auth' | 'quota' | 'model_unavailable' | 'general'
  provider: ModelProvider
}

export interface StreamChunk {
  content: string
  done: boolean
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}