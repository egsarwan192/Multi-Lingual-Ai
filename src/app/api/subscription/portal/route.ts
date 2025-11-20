import { NextResponse } from 'next/server'

/**
 * STUB SUBSCRIPTION ROUTE - Subscriptions removed
 *
 * TODO: Subscriptions were removed from this application.
 * This route returns a 404 response indicating that subscription functionality is no longer available.
 *
 * This stub maintains the API route structure to prevent import errors while
 * clearly indicating that the subscription functionality has been removed.
 */

export async function POST() {
  return NextResponse.json(
    {
      error: 'Subscriptions removed',
      code: 'subscriptions_removed',
      message: 'Subscription functionality has been removed from this application.'
    },
    { status: 404 }
  )
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'Subscriptions removed',
      code: 'subscriptions_removed',
      message: 'Subscription functionality has been removed from this application.'
    },
    { status: 404 }
  )
}
