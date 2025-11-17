import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/supabase/server'

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

  // Add security headers for all routes
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Security headers configuration
  const securityHeaders = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.stripe.com https://js.stripe.com;",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': process.env.NODE_ENV === 'production' ? 'max-age=31536000; includeSubDomains' : undefined,
  }

  Object.entries(securityHeaders).forEach(([key, value]) => {
    if (value) {
      response.headers.set(key, value)
    }
  })

  // Allow public routes to proceed without authentication
  if (publicRoutes.includes(pathname)) {
    return response
  }

  // Check authentication for protected routes
  const session = await getSession()

  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!session) {
      // Redirect to login with return URL
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('returnTo', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return response
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