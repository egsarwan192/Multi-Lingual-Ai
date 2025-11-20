'use client'

import { useState } from 'react'
import { AlertCircle, X } from 'lucide-react'

type SignupFormProps = {
  onSuccess?: () => void
}

/**
 * STUB SIGNUP FORM - Authentication removed
 *
 * TODO: Authentication was removed from this application.
 * This component displays a message indicating that signup functionality is no longer available.
 *
 * This stub maintains the component structure and exports to prevent import errors while
 * clearly indicating that the authentication functionality has been removed.
 */

export default function SignupForm({ onSuccess }: SignupFormProps) {
  const [isVisible, setIsVisible] = useState(true)

  const handleDismiss = () => {
    setIsVisible(false)
    if (typeof onSuccess === 'function') {
      onSuccess()
    }
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 shadow-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Authentication Removed
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  Signup functionality has been removed from this application.
                  You now have access to all features without creating an account.
                </p>
              </div>
              <div className="mt-4">
                <div className="flex">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-xs font-medium rounded-md text-yellow-800 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="inline-flex p-1.5 text-yellow-600 hover:text-yellow-800 focus:outline-none"
                >
                  <span className="sr-only">Dismiss</span>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}