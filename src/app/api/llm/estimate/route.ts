import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { openRouterService } from '@/lib/llm/OpenRouterService'
import { z } from 'zod'

// Validation schema for token estimation
const estimateSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  modelId: z.string().optional(),
  includeContext: z.boolean().optional().default(false)
})

export async function POST(request: NextRequest) {
  try {
    // Get current session
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'no_session' },
        { status: 401 }
      )
    }

    // Validate request body
    const body = await request.json()
    const validatedData = estimateSchema.parse(body)
    const { text, modelId, includeContext } = validatedData

    // Estimate tokens using OpenRouter service
    const estimatedTokens = openRouterService.estimateTokens(text, modelId)

    // Get model information for cost estimation
    let estimatedCost = 0
    let modelInfo = null
    let contextWindow = 0

    if (modelId) {
      const allModels = openRouterService.getAvailableModels()
      modelInfo = allModels.find(m => m.id === modelId)

      if (modelInfo) {
        estimatedCost = (estimatedTokens / 1000) * modelInfo.costPer1KTokens
        contextWindow = modelInfo.contextWindow
      }
    }

    // Enhanced estimation with context analysis if requested
    let contextAnalysis = null
    if (includeContext && modelInfo) {
      contextAnalysis = {
        contextWindowUsedPercent: contextWindow > 0 ? Math.min((estimatedTokens / contextWindow) * 100, 95) : 0,
        remainingContextTokens: Math.max(0, contextWindow - estimatedTokens),
        recommendedContextSize: Math.floor(contextWindow * 0.8), // Recommend using 80% of context
        efficiencyScore: calculateContextEfficiency(estimatedTokens, contextWindow)
      }
    }

    // Language and complexity analysis
    const textAnalysis = analyzeTextComplexity(text)

    // Batch estimation for multiple models if no specific model provided
    let multiModelEstimates = null
    if (!modelId) {
      const allModels = openRouterService.getAvailableModels()
      multiModelEstimates = allModels.map(model => ({
        model: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          tier: model.tier
        },
        estimatedTokens: openRouterService.estimateTokens(text, model.id),
        estimatedCost: (estimatedTokens / 1000) * model.costPer1KTokens
      })).sort((a, b) => a.estimatedCost - b.estimatedCost) // Sort by cost (cheapest first)
    }

    return NextResponse.json({
      success: true,
      text: {
        original: text,
        length: text.length,
        wordCount: text.split(/\s+/).length,
        characterCountWithoutSpaces: text.replace(/\s+/g, '').length,
        analysis: textAnalysis
      },
      tokens: {
        estimated: estimatedTokens,
        approximate: true,
        confidence: modelInfo ? 'high' : 'medium',
        ...(contextAnalysis && {
          context: contextAnalysis
        })
      },
      cost: {
        estimated: estimatedCost,
        currency: 'USD',
        ...(modelInfo ? {
          model: {
            id: modelInfo.id,
            name: modelInfo.name,
            provider: modelInfo.provider,
            costPer1KTokens: modelInfo.costPer1KTokens,
            tier: modelInfo.tier
          },
          costEfficiency: calculateCostEfficiency(estimatedTokens, modelInfo),
          comparison: getModelCostComparison(estimatedTokens, modelInfo.id)
        } : null)
      },
      ...(multiModelEstimates && {
        multiModelEstimates,
        recommendations: {
          cheapest: multiModelEstimates[0],
          fastest: multiModelEstimates.sort((a, b) => b.model.provider.localeCompare(a.model.provider))[0], // OpenAI often fastest
          balanced: getBalancedModel(multiModelEstimates)
        }
      }
      })
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Estimate tokens error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Analyze text complexity for better estimation
function analyzeTextComplexity(text: string) {
  const words = text.split(/\s+/).filter(w => w.length > 0)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)

  // Calculate complexity metrics
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length
  const wordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0
  const sentencesPerParagraph = paragraphs.length > 0 ? sentences.length / paragraphs.length : 0

  // Character analysis
  const uppercaseRatio = (text.match(/[A-Z]/g) || []).length / text.length
  const punctuationDensity = (text.match(/[.,!?;:]/g) || []).length / text.length
  const numberDensity = (text.match(/\d+/g) || []).length / text.length

  return {
    complexity: calculateComplexityScore(avgWordLength, wordsPerSentence, punctuationDensity),
    languageType: detectLanguageType(uppercaseRatio, punctuationDensity, numberDensity),
    structure: {
      paragraphs: paragraphs.length,
      sentences: sentences.length,
      words: words.length,
      avgWordLength: Math.round(avgWordLength * 100) / 100,
      avgWordsPerSentence: Math.round(wordsPerSentence * 100) / 100
    },
    characteristics: {
      hasNumbers: numberDensity > 0,
      hasPunctuation: punctuationDensity > 0.02,
      formalTone: uppercaseRatio > 0.05 && sentencesPerParagraph <= 3,
      technicalContent: numberDensity > 0.05 && avgWordLength > 6
    },
    estimatedProcessingDifficulty: getProcessingDifficulty(text)
  }
}

// Calculate complexity score
function calculateComplexityScore(avgWordLength: number, wordsPerSentence: number, punctuationDensity: number): string {
  let score = 0

  // Word length factor (0-3 points)
  if (avgWordLength < 4) score += 0
  else if (avgWordLength < 6) score += 1
  else if (avgWordLength < 8) score += 2
  else score += 3

  // Sentence complexity factor (0-2 points)
  if (wordsPerSentence < 10) score += 0
  else if (wordsPerSentence < 20) score += 1
  else score += 2

  // Punctuation factor (0-1 points)
  if (punctuationDensity < 0.02) score += 0
  else if (punctuationDensity < 0.05) score += 1
  else score += 1

  const total = 6
  if (score <= total * 0.3) return 'low'
  if (score <= total * 0.6) return 'medium'
  if (score <= total * 0.8) return 'high'
  return 'very_high'
}

// Detect language type
function detectLanguageType(uppercaseRatio: number, punctuationDensity: number, numberDensity: number): string {
  if (numberDensity > 0.1) return 'technical_code'
  if (uppercaseRatio > 0.1 && punctuationDensity < 0.03) return 'formal_academic'
  if (punctuationDensity > 0.08) return 'conversational'
  if (numberDensity < 0.01 && uppercaseRatio < 0.05) return 'casual'
  return 'general'
}

// Get processing difficulty
function getProcessingDifficulty(text: string): string {
  const hasComplexWords = /\b(?:according|therefore|consequently|nevertheless|furthermore|however|moreover)\b/gi.test(text)
  const hasCodeBlocks = /```[\s\S]*?```/g.test(text)
  const hasMathFormulas = /[\$]{1,2}[\s\S]*?[\$]{1,2}/g.test(text)
  const hasSpecialChars = /[^\w\s.,!?;:'"\-\n\r\t]/.test(text)

  if (hasCodeBlocks || hasMathFormulas) return 'high'
  if (hasComplexWords && hasSpecialChars) return 'medium'
  if (hasComplexWords || hasSpecialChars) return 'low'
  return 'very_low'
}

// Calculate context efficiency score
function calculateContextEfficiency(usedTokens: number, contextWindow: number): number {
  if (contextWindow <= 0) return 0

  const utilizationRatio = usedTokens / contextWindow

  // Optimal is around 60-80% utilization
  if (utilizationRatio < 0.4) return 50 // Underutilized
  if (utilizationRatio < 0.6) return 75 // Good efficiency
  if (utilizationRatio < 0.8) return 95 // Optimal efficiency
  return 80 // Near max, potential overflow risk
}

// Calculate cost efficiency
function calculateCostEfficiency(estimatedTokens: number, modelInfo: any): object {
  const costPerToken = modelInfo.costPer1KTokens / 1000
  const theoreticalMaxTokens = Math.min(estimatedTokens, modelInfo.contextWindow * 0.8)
  const costPerTheoreticalToken = theoreticalMaxTokens > 0 ? costPerToken / theoreticalMaxTokens : 0

  return {
    costPerToken: costPerToken,
    costPerContextWindow: modelInfo.costPer1KTokens * modelInfo.contextWindow / 1000,
    efficiency: costPerTheoreticalToken,
    valueScore: calculateValueScore(modelInfo)
  }
}

// Get model cost comparison
function getModelCostComparison(estimatedTokens: number, modelId: string): object {
  const allModels = openRouterService.getAvailableModels()
  const currentModel = allModels.find(m => m.id === modelId)
  const alternatives = allModels.filter(m => m.tier === currentModel?.tier && m.id !== modelId)

  const costs = alternatives.map(model => ({
    modelId: model.id,
    modelName: model.name,
    provider: model.provider,
    estimatedCost: (estimatedTokens / 1000) * model.costPer1KTokens,
    costDifference: (estimatedTokens / 1000) * model.costPer1KTokens - (estimatedTokens / 1000) * currentModel!.costPer1KTokens
  }))

  const cheaperAlternatives = costs.filter(c => c.costDifference < 0).sort((a, b) => a.costDifference - b.costDifference)

  return {
    cheaperAlternatives: cheaperAlternatives.slice(0, 3), // Top 3 cheaper options
    moreExpensiveAlternatives: costs.filter(c => c.costDifference > 0).slice(0, 3),
    isCheapestOption: costs.length === 0 || !costs.some(c => c.costDifference < 0)
  }
}

// Calculate value score for cost-benefit analysis
function calculateValueScore(modelInfo: any): number {
  let score = 50 // Base score

  // Adjust based on provider reputation (mock data)
  const providerScores: Record<string, number> = {
    'OPENAI': 10,
    'ANTHROPIC': 8,
    'GOOGLE': 7,
    'DEEPSEEK': 6
  }

  score += providerScores[modelInfo.provider] || 0

  // Adjust based on performance characteristics
  if (modelInfo.contextWindow > 100000) score += 15 // Large context bonus
  if (modelInfo.maxTokens > 8000) score += 10 // Large output bonus

  // Adjust based on tier (value proposition)
  if (modelInfo.tier === 'free') score += 20
  if (modelInfo.tier === 'premium') score += 10
  // Pro tier gets 0 bonus (paid feature)

  return Math.min(100, score)
}

// Get balanced model recommendation
function getBalancedModel(estimates: any[]): any {
  // Balance cost, speed, and quality
  const balanced = estimates.map(estimate => ({
    ...estimate,
    balanceScore: calculateBalanceScore(estimate)
  })).sort((a, b) => b.balanceScore - a.balanceScore)

  return balanced[0] || estimates[0]
}

// Calculate balance score for model selection
function calculateBalanceScore(estimate: any): number {
  const costScore = Math.max(0, 100 - estimate.estimatedCost * 100) // Lower cost = higher score

  // Mock quality scores by provider
  const qualityScores: Record<string, number> = {
    'OPENAI': 85,
    'ANTHROPIC': 90,
    'GOOGLE': 80,
    'DEEPSEEK': 75
  }

  const qualityScore = qualityScores[estimate.model.provider] || 75

  // Mock speed scores by provider
  const speedScores: Record<string, number> = {
    'OPENAI': 90,
    'ANTHROPIC': 75,
    'GOOGLE': 85,
    'DEEPSEEK': 70
  }

  const speedScore = speedScores[estimate.model.provider] || 75

  return (costScore * 0.4) + (qualityScore * 0.4) + (speedScore * 0.2)
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}