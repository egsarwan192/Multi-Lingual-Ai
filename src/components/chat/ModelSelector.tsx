'use client'

import { useChatStore } from '@/stores/chatStore'
import { LLMModel } from '@/lib/llm/types'
import { ModelProvider } from '@prisma/client'

interface ModelSelectorProps {
  className?: string
}

export function ModelSelector({ className = '' }: ModelSelectorProps) {
  const selectedModel = useChatStore(state => state.selectedModel)
  const availableModels = useChatStore(state => state.availableModels)
  const selectModel = useChatStore(state => state.selectModel)

  const handleModelChange = (modelId: string) => {
    selectModel(modelId)
  }

  const getProviderColor = (provider: ModelProvider): string => {
    switch (provider) {
      case 'OPENAI':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'ANTHROPIC':
        return 'text-purple-600 bg-purple-50 border-purple-200'
      case 'GOOGLE':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'DEEPSEEK':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getProviderLabel = (provider: ModelProvider): string => {
    switch (provider) {
      case 'OPENAI':
        return 'OpenAI'
      case 'ANTHROPIC':
        return 'Anthropic'
      case 'GOOGLE':
        return 'Google'
      case 'DEEPSEEK':
        return 'Deepseek'
      default:
        return provider
    }
  }

  const formatModelName = (model: LLMModel): string => {
    return `${getProviderLabel(model.provider)} - ${model.name}`
  }

  return (
    <div className={`relative ${className}`}>
      <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 mb-2">
        Select Model
      </label>

      <select
        id="model-select"
        value={selectedModel?.id || ''}
        onChange={(e) => handleModelChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm"
        disabled={availableModels.length === 0}
      >
        <option value="" disabled>
          {availableModels.length === 0 ? 'Loading models...' : 'Choose a model...'}
        </option>

        {availableModels.map((model) => (
          <option key={model.id} value={model.id}>
            {formatModelName(model)}
          </option>
        ))}
      </select>

      {selectedModel && (
        <div className="mt-2">
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getProviderColor(selectedModel.provider)}`}>
            {getProviderLabel(selectedModel.provider)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Max tokens: {selectedModel.maxTokens.toLocaleString()} •
            Context: {selectedModel.contextWindow.toLocaleString()}
          </div>
        </div>
      )}

      {availableModels.length === 0 && (
        <div className="mt-2 text-xs text-gray-500">
          No models available. Check your subscription tier.
        </div>
      )}
    </div>
  )
}