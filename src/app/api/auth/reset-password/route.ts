import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import crypto from 'crypto'

// Input validation schema for reset request
const resetRequestSchema = z.object({
  email: z.string().email('Invalid email format')
})

// Input validation schema for password reset
const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain uppercase, lowercase, number, and special character'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

// Store reset tokens (in production, use database or Redis)
const resetTokens = new Map<string, { email: string; timestamp: number; used: boolean }>()

// Rate limiting for reset requests
const resetAttempts = new Map<string, { count: number; resetTime: number }>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'

    // Determine if this is a reset request or password update
    if (body.token) {
      // This is a password reset with token
      return handlePasswordReset(body)
    } else {
      // This is a reset request
      return handleResetRequest(body, ip)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Password reset error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function handleResetRequest(body: any, ip: string) {
  // Validate input
  const validatedData = resetRequestSchema.parse(body)
  const { email } = validatedData

  // Check rate limiting
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour
  const maxAttempts = 3

  const key = `${email}:${ip}`
  const existing = resetAttempts.get(key)

  if (existing && now < existing.resetTime && existing.count >= maxAttempts) {
    return NextResponse.json(
      {
        error: 'Too many reset attempts. Please try again later.',
        code: 'rate_limited',
        resetTime: existing.resetTime
      },
      { status: 429 }
    )
  }

  // Update rate limit counter
  if (!existing || now > existing.resetTime) {
    resetAttempts.set(key, { count: 1, resetTime: now + windowMs })
  } else {
    existing.count += 1
  }

  // Create Supabase client
  const supabase = await createServerClient()

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

  // Store reset token
  resetTokens.set(resetToken, {
    email,
    timestamp: Date.now(),
    used: false
  })

  // In production, you would send this via email
  console.log(`Password reset token for ${email}: ${resetToken}`)
  console.log(`Reset link: ${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`)

  return NextResponse.json({
    success: true,
    message: 'Password reset instructions sent to your email',
    // Include token in development for easier testing
    ...(process.env.NODE_ENV === 'development' && { resetToken })
  })
}

async function handlePasswordReset(body: any) {
  // Validate input
  const validatedData = passwordResetSchema.parse(body)
  const { token, password } = validatedData

  // Check if token exists and is valid
  const tokenData = resetTokens.get(token)

  if (!tokenData) {
    return NextResponse.json(
      { error: 'Invalid or expired reset token', code: 'invalid_token' },
      { status: 400 }
    )
  }

  if (tokenData.used) {
    return NextResponse.json(
      { error: 'Reset token already used', code: 'token_used' },
      { status: 400 }
    )
  }

  if (Date.now() - tokenData.timestamp > 60 * 60 * 1000) { // 1 hour
    resetTokens.delete(token)
    return NextResponse.json(
      { error: 'Reset token expired', code: 'token_expired' },
      { status: 400 }
    )
  }

  // Mark token as used
  tokenData.used = true

  // Create Supabase client
  const supabase = await createServerClient()

  // Get user by email
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const user = users.find(u => u.email === tokenData.email)

  if (!user) {
    return NextResponse.json(
      { error: 'User not found', code: 'user_not_found' },
      { status: 404 }
    )
  }

  // Update user password
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password }
  )

  if (updateError) {
    return NextResponse.json(
      { error: 'Failed to update password', code: 'update_failed' },
      { status: 500 }
    )
  }

  // Clean up token
  resetTokens.delete(token)

  return NextResponse.json({
    success: true,
    message: 'Password updated successfully'
  })
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}