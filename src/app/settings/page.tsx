'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useUserStore } from '@/stores/userStore'

type SettingsTab = 'profile' | 'subscription' | 'preferences' | 'notifications' | 'security'

export default function SettingsPage() {
  const router = useRouter()
  const user = useUserStore(state => state.user)
  const subscription = useUserStore(state => state.subscription)
  const isLoading = useUserStore(state => state.isLoading)

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [formData, setFormData] = useState({
    email: '',
    displayName: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [preferences, setPreferences] = useState({
    defaultModel: '',
    theme: 'system',
    fontSize: 'medium',
    language: 'en'
  })
  const [notifications, setNotifications] = useState({
    email: true,
    browser: true,
    newMessages: true,
    billingAlerts: true
  })

  // Redirect unauthenticated users
  useEffect(() => {
    if (!user && !isLoading) {
      router.push('/')
    }
  }, [user, isLoading, router])

  // Initialize form data when user loads
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        email: user.email || '',
        displayName: user.displayName || user.email || ''
      }))
    }
  }, [user])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'subscription', label: 'Subscription', icon: '💳' },
    { id: 'preferences', label: 'Preferences', icon: '⚙️' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'security', label: 'Security', icon: '🔒' }
  ] as const

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          displayName: formData.displayName
        })
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to update profile')
        return
      }

      alert('Profile updated successfully!')
    } catch (error) {
      alert('Failed to update profile')
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.newPassword !== formData.confirmPassword) {
      alert('Passwords do not match')
      return
    }

    try {
      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        })
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to update password')
        return
      }

      alert('Password updated successfully!')
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }))
    } catch (error) {
      alert('Failed to update password')
    }
  }

  const handlePreferencesSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to update preferences')
        return
      }

      alert('Preferences updated successfully!')
    } catch (error) {
      alert('Failed to update preferences')
    }
  }

  const handleNotificationsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/user/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications)
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to update notifications')
        return
      }

      alert('Notification preferences updated successfully!')
    } catch (error) {
      alert('Failed to update notification preferences')
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return
    }

    if (!confirm('This will permanently delete all your chats, data, and subscription. Are you absolutely sure?')) {
      return
    }

    try {
      const response = await fetch('/api/user/account', {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to delete account')
        return
      }

      // Redirect to home page after successful deletion
      router.push('/')
    } catch (error) {
      alert('Failed to delete account')
    }
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Profile Information</h3>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Button type="submit" variant="primary">
                  Update Profile
                </Button>
              </form>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={formData.currentPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={formData.newPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Button type="submit" variant="primary">
                  Update Password
                </Button>
              </form>
            </div>
          </div>
        )

      case 'subscription':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Current Subscription</h3>
              {subscription ? (
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-lg font-medium text-gray-900 capitalize">
                        {subscription.tier}
                      </p>
                      <p className="text-sm text-gray-600">
                        {subscription.status === 'active' ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        ${subscription.tier === 'free' ? '0' : subscription.tier === 'premium' ? '20' : '50'}
                        <span className="text-sm font-normal">/month</span>
                      </p>
                    </div>
                  </div>

                  {subscription.currentPeriodEnd && (
                    <p className="text-sm text-gray-600">
                      Next billing date: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}

                  <div className="mt-6 flex space-x-4">
                    <Button
                      onClick={() => router.push('/settings/billing')}
                      variant="primary"
                    >
                      Manage Billing
                    </Button>
                    {subscription.tier !== 'free' && (
                      <Button
                        onClick={() => router.push('/settings/subscription/cancel')}
                        variant="secondary"
                      >
                        Cancel Subscription
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-6">
                  <p className="text-gray-600 mb-4">No active subscription</p>
                  <Button
                    onClick={() => router.push('/settings/billing')}
                    variant="primary"
                  >
                    Choose Plan
                  </Button>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Usage Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Messages Today</p>
                  <p className="text-2xl font-bold text-gray-900">--</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Tokens Used Today</p>
                  <p className="text-2xl font-bold text-gray-900">--</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Monthly Cost</p>
                  <p className="text-2xl font-bold text-gray-900">$--</p>
                </div>
              </div>
            </div>
          </div>
        )

      case 'preferences':
        return (
          <form onSubmit={handlePreferencesSubmit} className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Chat Preferences</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Model
                  </label>
                  <select
                    value={preferences.defaultModel}
                    onChange={(e) => setPreferences(prev => ({ ...prev, defaultModel: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a model...</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="claude-3-sonnet-20240229">Claude-3 Sonnet</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Theme
                  </label>
                  <select
                    value={preferences.theme}
                    onChange={(e) => setPreferences(prev => ({ ...prev, theme: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Font Size
                  </label>
                  <select
                    value={preferences.fontSize}
                    onChange={(e) => setPreferences(prev => ({ ...prev, fontSize: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Language
                  </label>
                  <select
                    value={preferences.language}
                    onChange={(e) => setPreferences(prev => ({ ...prev, language: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="zh">中文</option>
                  </select>
                </div>
              </div>
            </div>

            <Button type="submit" variant="primary">
              Save Preferences
            </Button>
          </form>
        )

      case 'notifications':
        return (
          <form onSubmit={handleNotificationsSubmit} className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Settings</h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Email Notifications</p>
                  <p className="text-sm text-gray-600">Receive updates via email</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.email}
                  onChange={(e) => setNotifications(prev => ({ ...prev, email: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Browser Notifications</p>
                  <p className="text-sm text-gray-600">Show desktop notifications</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.browser}
                  onChange={(e) => setNotifications(prev => ({ ...prev, browser: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">New Messages</p>
                  <p className="text-sm text-gray-600">Notify when you receive new messages</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.newMessages}
                  onChange={(e) => setNotifications(prev => ({ ...prev, newMessages: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Billing Alerts</p>
                  <p className="text-sm text-gray-600">Get notified about billing changes</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.billingAlerts}
                  onChange={(e) => setNotifications(prev => ({ ...prev, billingAlerts: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
            </div>

            <Button type="submit" variant="primary">
              Save Notification Settings
            </Button>
          </form>
        )

      case 'security':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Security Settings</h3>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                  <p className="text-sm text-gray-600 mb-3">Add an extra layer of security to your account</p>
                  <Button variant="secondary" disabled>
                    Coming Soon
                  </Button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-medium text-gray-900">Session Management</p>
                  <p className="text-sm text-gray-600 mb-3">View and manage your active sessions</p>
                  <Button variant="secondary" disabled>
                    Coming Soon
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-red-900 mb-4">Danger Zone</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="mb-4">
                  <h4 className="font-medium text-red-900">Delete Account</h4>
                  <p className="text-sm text-red-700 mt-1">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                </div>
                <Button
                  onClick={handleDeleteAccount}
                  variant="primary"
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your account settings and preferences</p>
        </div>

        <div className="bg-white rounded-lg shadow">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  )
}