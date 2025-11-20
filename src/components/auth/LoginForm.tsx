'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import Button from '@/components/ui/Button'


type LoginFormProps = {
  onSuccess?: () => void
}


// Login form validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  remember: z.boolean().optional().default(false)
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, error } = useAuthStore(state => ({
    login: state.login,
    error: state.error
  }))
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      remember: false
    }
  })

  const { errors, isSubmitting } = formState

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)

    try {
      // call the login function from your store (make sure login is a function)
      await login(data.email, data.password, data.remember)

      // if parent passed onSuccess, call it; otherwise redirect to returnTo or /chat
      if (typeof onSuccess === 'function') {
        onSuccess()
      } else {
        const returnTo = searchParams.get('returnTo')
        router.push(returnTo || '/chat')
      }
    } catch (error) {
      console.error('Login failed:', error)
      setIsLoading(false)
    }
  }

  const handlePasswordReset = () => {
    router.push('/reset-password')
  }

  const handleSignup = () => {
    router.push('/signup')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-2 text-sm text-gray-600">
              Sign in to your Multi-LLM Platform account
            </p>
          </div>

          {/* Error Display */}
          {(errors?.root || error) && (
            <div className="rounded-md bg-red-50 p-4 mb-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <User className="w-3 h-3 text-white" />
                  </div>
                </div>

                <div className="ml-3 text-sm text-red-700">
                  <p className="font-medium">
                    {errors?.root?.message || error}
                  </p>
                </div>
              </div>
            </div>
          )}


          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 sm:text-sm sm:leading-6 pl-10"
                  placeholder="you@example.com"
                  disabled={isSubmitting}
                />
              </div>
              {errors?.email && (
                <p className="mt-1 text-sm text-red-600">
                  {errors?.email?.message}
                </p>
              )}

            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 sm:text-sm sm:leading-6 pl-10"
                  placeholder="•••••••••••••"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors?.password && (
                <p className="mt-1 text-sm text-red-600">
                  {errors?.password?.message}
                </p>
              )}
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  {...register('remember')}
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  disabled={isSubmitting}
                />
                <label htmlFor="remember" className="ml-2 block text-sm text-gray-900">
                  Remember me
                </label>
              </div>

              <button
                type="button"
                onClick={handlePasswordReset}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit Button */}
            <div>
              <Button
                type="submit"
                disabled={isSubmitting || isLoading}
                loading={isLoading || isSubmitting}
                className="w-full"
              >
                {isLoading || isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>

            </div>

            {/* Sign Up Link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={handleSignup}
                  className="font-medium text-blue-600 hover:text-blue-500 hover:underline"
                >
                  Sign up
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}