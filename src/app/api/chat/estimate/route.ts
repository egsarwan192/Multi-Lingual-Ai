import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { openRouterService } from '@/lib/llm/OpenRouterService'
import { z } from 'zod'

// Validation schema for token estimation
const estimateSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  modelId: z.string().optional()
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
    const { text, modelId } = validatedData

    // Estimate tokens using the OpenRouter service
    const estimatedTokens = openRouterService.estimateTokens(text, modelId)

    // Get model information for cost estimation
    let estimatedCost = 0
    let modelInfo = null

    if (modelId) {
      const allModels = openRouterService.getAvailableModels()
      modelInfo = allModels.find(m => m.id === modelId)

      if (modelInfo) {
        estimatedCost = (estimatedTokens / 1000) * modelInfo.costPer1KTokens
      }
    }

    // Return estimation with additional context
    return NextResponse.json({
      success: true,
      text: {
        original: text,
        length: text.length,
        wordCount: text.split(/\s+/).length
      },
      tokens: {
        estimated: estimatedTokens,
        approximate: true
      },
      cost: {
        estimated: estimatedCost,
        currency: 'USD',
        model: modelInfo ? {
          id: modelInfo.id,
          name: modelInfo.name,
          provider: modelInfo.provider,
          costPer1KTokens: modelInfo.costPer1KTokens
        } : null
      },
      context: {
        charactersPerToken: Math.round(text.length / estimatedTokens * 100) / 100,
        // This gives a more accurate estimation
      }
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

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}