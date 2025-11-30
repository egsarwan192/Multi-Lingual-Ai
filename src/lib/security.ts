import { NextRequest, NextResponse } from 'next/server'
import { getRateLimiterForPath } from './rateLimit'

export interface SecurityConfig {
  enableRateLimit: boolean
  enableCSRF: boolean
  enableCORS: boolean
  enableSecurityHeaders: boolean
  allowedOrigins?: string[]
}

export class SecurityMiddleware {
  constructor(private config: SecurityConfig = {}) {}

  middleware() {
    return async (request: NextRequest) => {
      const response = NextResponse.next()

      // Apply security headers
      if (this.config.enableSecurityHeaders !== false) {
        this.addSecurityHeaders(response, request)
      }

      // Apply CORS headers if enabled
      if (this.config.enableCORS) {
        this.addCORSHeaders(response, request)
      }

      // Apply rate limiting
      if (this.config.enableRateLimit !== false) {
        const rateLimiter = getRateLimiterForPath(request.nextUrl.pathname)
        if (rateLimiter) {
          const rateLimitResult = rateLimiter.check(request)
          if (!rateLimitResult.success) {
            return new Response(
              JSON.stringify({
                error: 'Rate limit exceeded',
                retryAfter: Math.ceil(((rateLimitResult.resetTime || 0) - Date.now()) / 1000)
              }),
              {
                status: 429,
                headers: {
                  'Content-Type': 'application/json',
                  'X-RateLimit-Limit': rateLimiter['config']?.maxRequests?.toString() || '100',
                  'X-RateLimit-Remaining': (rateLimitResult.remaining || 0).toString(),
                  'X-RateLimit-Reset': ((rateLimitResult.resetTime || 0) / 1000).toString(),
                  'Retry-After': Math.ceil(((rateLimitResult.resetTime || 0) - Date.now()) / 1000).toString()
                }
              }
            )
          }

          // Add rate limit headers to successful response
          response.headers.set('X-RateLimit-Limit', rateLimiter['config']?.maxRequests?.toString() || '100')
          response.headers.set('X-RateLimit-Remaining', (rateLimitResult.remaining || 0).toString())
          response.headers.set('X-RateLimit-Reset', ((rateLimitResult.resetTime || 0) / 1000).toString())
        }
      }

      // Apply CSRF protection for state-changing requests
      if (this.config.enableCSRF && this.isStateChangingRequest(request)) {
        const csrfError = this.validateCSRF(request)
        if (csrfError) {
          return new Response(
            JSON.stringify({
              error: csrfError
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            }
          )
        }
      }

      return response
    }
  }

  private addSecurityHeaders(response: NextResponse, request: NextRequest) {
    const headers = response.headers

    // Content Security Policy
    headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' https://api.stripe.com https://*.supabase.co",
        "frame-src 'self' https://js.stripe.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests"
      ].join('; ')
    )

    // HTTP Strict Transport Security (only in production)
    if (process.env.NODE_ENV === 'production') {
      headers.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      )
    }

    // X-Frame-Options
    headers.set('X-Frame-Options', 'DENY')

    // X-Content-Type-Options
    headers.set('X-Content-Type-Options', 'nosniff')

    // Referrer Policy
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Permissions Policy
    headers.set(
      'Permissions-Policy',
      [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=(self)',
        'usb=()',
        'magnetometer=()',
        'gyroscope=()',
        'accelerometer=()'
      ].join(', ')
    )

    // Cross-Origin Embedder Policy
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp')

    // Cross-Origin Resource Policy
    headers.set('Cross-Origin-Resource-Policy', 'same-origin')

    // Remove server information
    headers.set('Server', '')

    // Remove X-Powered-By header (Next.js adds this)
    headers.delete('X-Powered-By')
  }

  private addCORSHeaders(response: NextResponse, request: NextRequest) {
    const origin = request.headers.get('origin')
    const allowedOrigins = this.config.allowedOrigins || [
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'https://*.vercel.app'
    ]

    // Check if origin is allowed
    const isOriginAllowed = !origin || allowedOrigins.some(allowed =>
      allowed === '*' || allowed === origin ||
      (allowed.includes('*') && origin.endsWith(allowed.replace('*.', '.')))
    )

    if (isOriginAllowed) {
      response.headers.set('Access-Control-Allow-Origin', origin || '*')
    }

    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Max-Age', '86400')
  }

  private isStateChangingRequest(request: NextRequest): boolean {
    const method = request.method.toLowerCase()
    return ['post', 'put', 'patch', 'delete'].includes(method)
  }

  private validateCSRF(request: NextRequest): string | null {
    // Skip CSRF check for API routes that are stateless or public
    const publicPaths = ['/api/auth/login', '/api/auth/signup', '/api/llm/models']
    if (publicPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
      return null
    }

    const token = request.headers.get('x-csrf-token')
    const cookieToken = request.cookies.get('csrf-token')?.value

    if (!token || !cookieToken) {
      return 'CSRF token missing'
    }

    if (token !== cookieToken) {
      return 'Invalid CSRF token'
    }

    return null
  }
}

// Input validation and sanitization utilities
export class InputValidator {
  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (typeof input !== 'string') return ''

    // Remove potentially dangerous characters
    const sanitized = input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim()
      .substring(0, maxLength)

    return sanitized
  }

  static sanitizeHtml(input: string): string {
    if (typeof input !== 'string') return ''

    // Basic HTML sanitization - in production, use a proper library like DOMPurify
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  static validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }

    if (password.length > 128) {
      errors.push('Password must be less than 128 characters')
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number')
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character')
    }

    // Check for common passwords
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'welcome']
    if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
      errors.push('Password cannot contain common words')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  static validateChatMessage(message: string): { valid: boolean; errors: string[]; sanitized?: string } {
    const errors: string[] = []

    if (message.length === 0) {
      errors.push('Message cannot be empty')
    }

    if (message.length > 10000) {
      errors.push('Message is too long (max 10,000 characters)')
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi
    ]

    const hasSuspiciousContent = suspiciousPatterns.some(pattern => pattern.test(message))
    if (hasSuspiciousContent) {
      errors.push('Message contains potentially unsafe content')
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizeString(message, 10000)
    }
  }
}

// CSRF token generation utilities
export class CSRFProtection {
  private static readonly TOKEN_LENGTH = 32
  private static readonly COOKIE_NAME = 'csrf-token'
  private static readonly HEADER_NAME = 'x-csrf-token'

  static generateToken(): string {
    const array = new Uint8Array(this.TOKEN_LENGTH)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  static setTokenCookie(response: NextResponse): void {
    const token = this.generateToken()
    response.cookies.set(this.COOKIE_NAME, token, {
      httpOnly: false, // Must be accessible to JavaScript for AJAX requests
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 // 24 hours
    })
  }

  static validateRequest(request: NextRequest): boolean {
    const token = request.headers.get(this.HEADER_NAME)
    const cookieToken = request.cookies.get(this.COOKIE_NAME)?.value

    return token === cookieToken && token !== undefined
  }
}

// Create default security middleware instance
export const securityMiddleware = new SecurityMiddleware({
  enableRateLimit: true,
  enableCSRF: true,
  enableCORS: true,
  enableSecurityHeaders: true,
  allowedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'https://*.vercel.app'
  ]
})