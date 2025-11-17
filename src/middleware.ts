import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'
import { securityMiddleware, CSRFProtection } from '@/lib/security'
import { getRateLimiterForPath } from '@/lib/rateLimit'

// Public routes that don't require authentication
const publicRoutes = ['/', '/login', '/signup', '/reset-password', '/verify-email']
const protectedRoutes = ['/chat', '/history', '/settings', '/billing']
const apiPublicRoutes = ['/api/auth/login', '/api/auth/signup', '/api/auth/reset-password']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files, images, and api public routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/api/health') ||
    apiPublicRoutes.some(route => pathname.startsWith(route))
  ) {
    return NextResponse.next()
  }

  // Create initial response with security middleware
  const securityResponse = securityMiddleware.middleware()(request)

  // Apply rate limiting for API routes
  if (pathname.startsWith('/api/')) {
    const rateLimiter = getRateLimiterForPath(pathname)
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
      securityResponse.headers.set('X-RateLimit-Limit', rateLimiter['config']?.maxRequests?.toString() || '100')
      securityResponse.headers.set('X-RateLimit-Remaining', (rateLimitResult.remaining || 0).toString())
      securityResponse.headers.set('X-RateLimit-Reset', ((rateLimitResult.resetTime || 0) / 1000).toString())
    }
  }

  // Allow public routes to proceed without authentication but with security
  if (publicRoutes.includes(pathname)) {
    // Set CSRF token for public pages that might have forms
    if (['/', '/login', '/signup'].includes(pathname)) {
      CSRFProtection.setTokenCookie(securityResponse)
    }
    return securityResponse
  }

  // Check authentication for protected routes
  const session = await getSession()

  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!session) {
      // Redirect to login with return URL
      const loginUrl = new URL('/', request.url) // Updated to redirect to home page instead of /login
      loginUrl.searchParams.set('returnTo', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Set CSRF token for authenticated users
  CSRFProtection.setTokenCookie(securityResponse)

  return securityResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!api/health|_next/static|_next/image|favicon.ico|public).*)',
  ],
}