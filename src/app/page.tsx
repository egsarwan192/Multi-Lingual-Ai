'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

export default function HomePage() {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="min-h-screen flex">
        {/* Left side - Hero content */}
        <div className="flex-1 flex flex-col justify-center px-8 lg:px-16">
          <div className="max-w-lg mx-auto w-full">
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Multi-LLM Platform
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Access cutting-edge AI models from OpenAI, Anthropic, Google, and Deepseek all in one powerful platform. Experience the future of conversational AI.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Multiple AI providers in one interface</span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Real-time streaming responses</span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Chat history and conversation management</span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Usage tracking and subscription management</span>
              </div>
            </div>

            <div className="flex space-x-4">
              <Button
                variant="primary"
                onClick={() => router.push('/chat')}
                className="flex-1"
              >
                Sign In
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/chat')}
                className="flex-1"
              >
                Create Account
              </Button>
            </div>

          </div>
        </div>

        {/* Right side - Info / auth stub */}
        <div className="flex-1 flex items-center justify-center px-8 lg:px-16 bg-white">
          <div className="max-w-md w-full">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isLogin ? 'Welcome Back' : 'Get Started'}
              </h2>
              <p className="text-gray-600 mt-2">
                {isLogin ? 'Sign in to your account (removed)' : 'Create your free account (removed)'}
              </p>
            </div>

            {/* Stub content instead of real Login/Signup forms */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="text-left">
                <h3 className="text-lg font-semibold mb-2">Authentication Removed</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Login and signup functionality has been removed. Click <strong>Sign In</strong> or <strong>Create Account</strong> to proceed to the chat.
                </p>

                <div className="flex items-center space-x-3">
                  <Button variant="primary" onClick={() => router.push('/chat')}>Go to Chat</Button>
                  <Button variant="ghost" onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Switch to Sign up' : 'Switch to Sign in'}</Button>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
