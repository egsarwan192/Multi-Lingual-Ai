import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import crypto from 'crypto'

// Input validation schema
const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
  email: z.string().email('Invalid email format').optional()
})

// Store verification tokens (in production, use database or Redis)
const verificationTokens = new Map<string, { email: string; timestamp: number; used: boolean }>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validatedData = verifyEmailSchema.parse(body)
    const { token, email } = validatedData

    // Check if token exists and is valid
    const tokenData = verificationTokens.get(token)

    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid verification token', code: 'invalid_token' },
        { status: 400 }
      )
    }

    if (tokenData.used) {
      return NextResponse.json(
        { error: 'Verification token already used', code: 'token_used' },
        { status: 400 }
      )
    }

    if (Date.now() - tokenData.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      verificationTokens.delete(token)
      return NextResponse.json(
        { error: 'Verification token expired', code: 'token_expired' },
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

    // Confirm user's email in Supabase
    const { error: confirmError } = await supabase.auth.admin.updateUserById(
      user.id,
      { email_confirm: true }
    )

    if (confirmError) {
      return NextResponse.json(
        { error: 'Failed to verify email', code: 'verification_failed' },
        { status: 500 }
      )
    }

    // Clean up token
    verificationTokens.delete(token)

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Email verification error:', error)
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

// Helper function to generate verification token (used during signup)
export function generateVerificationToken(email: string): string {
  const token = crypto.randomBytes(32).toString('hex')

  verificationTokens.set(token, {
    email,
    timestamp: Date.now(),
    used: false
  })

  // In production, you would send this via email
  console.log(`Verification token for ${email}: ${token}`)
  console.log(`Verification link: ${process.env.NEXTAUTH_URL}/verify-email?token=${token}`)

  return token
}