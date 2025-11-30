import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

// In-memory store for rate limiting (in production, use Redis)
const rateLimitStore: RateLimitStore = {}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const key in rateLimitStore) {
    if (rateLimitStore[key].resetTime <= now) {
      delete rateLimitStore[key]
    }
  }
}, 60000) // Clean up every minute

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  skipSuccessfulRequests?: boolean // Don't count successful requests
  skipFailedRequests?: boolean // Don't count failed requests
  message?: string // Custom error message
}

export class RateLimiter {
  constructor(private config: RateLimitConfig) {}

  check(request: NextRequest): { success: boolean; resetTime?: number; remaining?: number } {
    const identifier = this.getIdentifier(request)
    const now = Date.now()

    if (!rateLimitStore[identifier]) {
      rateLimitStore[identifier] = {
        count: 0,
        resetTime: now + this.config.windowMs
      }
    }

    const store = rateLimitStore[identifier]

    // Reset if window expired
    if (store.resetTime <= now) {
      store.count = 0
      store.resetTime = now + this.config.windowMs
    }

    // Check if over limit
    const isOverLimit = store.count >= this.config.maxRequests

    if (!isOverLimit) {
      store.count++
    }

    return {
      success: !isOverLimit,
      resetTime: store.resetTime,
      remaining: Math.max(0, this.config.maxRequests - store.count)
    }
  }

  private getIdentifier(request: NextRequest): string {
    // Try to get user ID from session if available
    const sessionCookie = request.cookies.get('sb-access-token')
    if (sessionCookie?.value) {
      // In a real implementation, you'd decode the JWT to get user ID
      // For now, use the token as identifier
      return `user:${sessionCookie.value.slice(0, 20)}`
    }

    // Fall back to IP address
    const forwarded = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const ip = forwarded?.split(',')[0] || realIp || 'unknown'
    return `ip:${ip}`
  }

  middleware() {
    return async (request: NextRequest) => {
      const result = this.check(request)

      const headers: Record<string, string> = {
        'X-RateLimit-Limit': this.config.maxRequests.toString(),
        'X-RateLimit-Remaining': (result.remaining || 0).toString(),
        'X-RateLimit-Reset': ((result.resetTime || 0) / 1000).toString()
      }

      if (result.success) {
        const response = NextResponse.next()
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
        return response
      }

      return new Response(
        JSON.stringify({
          error: this.config.message || 'Too Many Requests',
          retryAfter: Math.ceil(((result.resetTime || 0) - Date.now()) / 1000)
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil(((result.resetTime || 0) - Date.now()) / 1000).toString(),
            ...headers
          }
        }
      )
    }
  }
}

// Pre-configured rate limiters for different endpoints
export const rateLimiters = {
  // General API rate limit
  api: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per 15 minutes
    message: 'API rate limit exceeded'
  }),

  // Authentication endpoints (more restrictive)
  auth: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 auth attempts per 15 minutes
    message: 'Too many authentication attempts. Please try again later.'
  }),

  // Chat message rate limit
  chat: new RateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 30, // 30 messages per minute
    message: 'Chat rate limit exceeded. Please wait before sending more messages.'
  }),

  // Chat creation rate limit
  createChat: new RateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 10, // 10 new chats per minute
    message: 'Chat creation rate limit exceeded. Please wait before creating more chats.'
  }),

  // User settings/changes
  settings: new RateLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 20, // 20 settings changes per 10 minutes
    message: 'Settings update rate limit exceeded. Please wait before making more changes.'
  }),

  // Subscription operations
  subscription: new RateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 3, // 3 subscription operations per 5 minutes
    message: 'Subscription operation rate limit exceeded. Please wait before trying again.'
  })
}

// Helper function to apply rate limiting based on path
export function getRateLimiterForPath(path: string): RateLimiter | null {
  if (path.startsWith('/api/auth')) return rateLimiters.auth
  if (path.startsWith('/api/chat/message')) return rateLimiters.chat
  if (path.startsWith('/api/chat/chats')) return rateLimiters.createChat
  if (path.startsWith('/api/user')) return rateLimiters.settings
  if (path.startsWith('/api/subscription')) return rateLimiters.subscription
  if (path.startsWith('/api/')) return rateLimiters.api

  return null
}