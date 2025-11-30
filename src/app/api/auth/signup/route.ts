import { NextResponse } from 'next/server'

/**
 * STUB AUTH ROUTE - Authentication removed
 *
 * TODO: Authentication was removed from this application.
 * This route returns a 404 response indicating that authentication is no longer available.
 *
 * This stub maintains the API route structure to prevent import errors while
 * clearly indicating that the authentication functionality has been removed.
 */

export async function POST() {
  return NextResponse.json(
    {
      error: 'Authentication removed',
      code: 'auth_removed',
      message: 'Authentication functionality has been removed from this application.'
    },
    { status: 404 }
  )
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'Authentication removed',
      code: 'auth_removed',
      message: 'Authentication functionality has been removed from this application.'
    },
    { status: 404 }
  )
}