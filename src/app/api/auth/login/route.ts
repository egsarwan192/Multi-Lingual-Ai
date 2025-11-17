import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { cookies } from 'next/headers'

// Simple in-memory rate limiting for development
// In production, use Redis or database-backed rate limiting
const loginAttempts = new Map<string, { count: number; resetTime: number }>()

// Input validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional()
})

// Rate limiting function
function checkRateLimit(email: string, ip: string): { allowed: boolean; remaining?: number; resetTime?: number } {
  const key = `${email}:${ip}`
  const now = Date.now()
  const windowMs = 15 * 60 * 1000 // 15 minutes
  const maxAttempts = 5

  const existing = loginAttempts.get(key)

  if (!existing || now > existing.resetTime) {
    // Reset or create new window
    loginAttempts.set(key, {
      count: 1,
      resetTime: now + windowMs
    })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (existing.count >= maxAttempts) {
    return {
      allowed: false,
      resetTime: existing.resetTime,
      remaining: 0
    }
  }

  existing.count += 1
  return {
    allowed: true,
    remaining: maxAttempts - existing.count,
    resetTime: existing.resetTime
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'

    // Validate input
    const validatedData = loginSchema.parse(body)
    const { email, password, remember } = validatedData

    // Check rate limiting
    const rateLimitResult = checkRateLimit(email, ip)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Too many failed login attempts. Please try again later.',
          code: 'rate_limited',
          resetTime: rateLimitResult.resetTime
        },
        { status: 429 }
      )
    }

    // Create Supabase client
    const supabase = await createServerClient()

    // Authenticate user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (authError) {
      return NextResponse.json(
        {
          error: 'Invalid email or password',
          code: 'invalid_credentials',
          remaining: rateLimitResult.remaining
        },
        { status: 401 }
      )
    }

    if (!authData.user || !authData.session) {
      return NextResponse.json(
        {
          error: 'Authentication failed',
          code: 'auth_failed'
        },
        { status: 401 }
      )
    }

    // Get user's subscription info from our database
    const user = await prisma.user.findUnique({
      where: { email: authData.user.email },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        subscription: {
          select: {
            tier: true,
            status: true,
            currentPeriodEnd: true
          }
        }
      }
    })

    if (!user) {
      // User exists in Supabase but not in our database
      return NextResponse.json(
        {
          error: 'User profile not found',
          code: 'profile_not_found'
        },
        { status: 401 }
      )
    }

    // Create session cookie
    const cookieStore = await cookies()

    // Set session duration based on "remember me" preference
    const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7 // 30 days vs 7 days

    cookieStore.set('sb-access-token', authData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/'
    })

    cookieStore.set('sb-refresh-token', authData.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/'
    })

    // Return success response with user data
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscription: user.subscription
      },
      session: {
        accessToken: authData.session.access_token,
        expiresIn: authData.session.expires_in
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Login error:', error)
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