import { LLMProvider, LLMModel, LLMResponse, Message, ModelProvider, APIErrorResponse } from '../types'

export class DeepseekProvider implements LLMProvider {
  name = 'Deepseek'
  private models: LLMModel[] = [
    {
      id: 'deepseek-coder',
      name: 'Deepseek Coder',
      provider: 'DEEPSEEK' as ModelProvider,
      tier: 'free',
      maxTokens: 4096,
      contextWindow: 16000,
      costPer1KTokens: 0.0001
    },
    {
      id: 'deepseek-chat',
      name: 'Deepseek Chat',
      provider: 'DEEPSEEK' as ModelProvider,
      tier: 'premium',
      maxTokens: 4096,
      contextWindow: 32000,
      costPer1KTokens: 0.00014
    }
  ]

  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY!
  }

  get availableModels(): LLMModel[] {
    return this.models
  }

  async validateToken(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.deepseek.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      return response.ok
    } catch (error) {
      console.error('Deepseek API validation failed:', error)
      return false
    }
  }

  estimateTokens(text: string): number {
    // Rough estimation for Deepseek (approximately 4 characters per token)
    return Math.ceil(text.length / 4)
  }

  async sendMessage(message: string, conversation: Message[], modelId: string): Promise<LLMResponse> {
    try {
      const selectedModel = this.models.find(m => m.id === modelId)
      if (!selectedModel) {
        throw new Error(`Model ${modelId} not found`)
      }

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
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
          max_tokens: selectedModel.maxTokens,
          stream: false
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(JSON.stringify(errorData))
      }

      const data = await response.json()

      return {
        content: data.choices[0]?.message?.content || '',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0
        },
        model: modelId,
        provider: 'DEEPSEEK',
        finishReason: data.choices[0]?.finish_reason || 'stop'
      }
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  async sendMessageStream(message: string, conversation: Message[], modelId: string): Promise<ReadableStream<Uint8Array>> {
    try {
      const selectedModel = this.models.find(m => m.id === modelId)
      if (!selectedModel) {
        throw new Error(`Model ${modelId} not found`)
      }

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
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
          max_tokens: selectedModel.maxTokens,
          stream: true
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(JSON.stringify(errorData))
      }

      return this.transformDeepseekStream(response.body!)
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  private async transformDeepseekStream(stream: ReadableStream): Promise<ReadableStream<Uint8Array>> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    return new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') {
                  controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
                  controller.close()
                  return
                }

                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices[0]?.delta?.content || ''
                  if (content) {
                    const sseData = `data: ${JSON.stringify({ content, done: false })}\n\n`
                    controller.enqueue(new TextEncoder().encode(sseData))
                  }
                } catch (e) {
                  // Skip malformed JSON
                }
              }
            }
          }
        } catch (error) {
          controller.error(error)
        }
      }
    })
  }

  private handleError(error: any): APIErrorResponse {
    if (error?.message?.includes('401') || error?.status === 401) {
      return {
        error: 'Invalid API key',
        code: 'invalid_api_key',
        type: 'auth',
        provider: 'DEEPSEEK'
      }
    } else if (error?.message?.includes('429') || error?.status === 429) {
      return {
        error: 'Rate limit exceeded',
        code: 'rate_limit_exceeded',
        type: 'rate_limit',
        provider: 'DEEPSEEK'
      }
    } else if (error?.message?.includes('insufficient_quota') || error?.status === 402) {
      return {
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        type: 'quota',
        provider: 'DEEPSEEK'
      }
    } else {
      return {
        error: error?.message || 'Unknown error occurred',
        type: 'general',
        provider: 'DEEPSEEK'
      }
    }
  }
}