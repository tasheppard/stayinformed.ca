'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import Link from 'next/link'

interface UserData {
  id: string
  email: string
  fullName: string | null
  isPremium: boolean
  subscriptionStatus: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

interface AccountSettingsClientProps {
  user: User
  userData: UserData | null
  supabaseUrl: string
  sessionId?: string
}

export default function AccountSettingsClient({
  user,
  userData,
  supabaseUrl,
  sessionId,
}: AccountSettingsClientProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Show success message if redirected from successful checkout
  useEffect(() => {
    if (sessionId) {
      setMessage('Subscription activated successfully! Welcome to Premium.')
      // Refresh user data
      router.refresh()
    }
  }, [sessionId, router])

  const handleSignOut = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleUpdateEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const formData = new FormData(e.currentTarget)
    const newEmail = formData.get('email') as string

    const { error: updateError } = await supabase.auth.updateUser({
      email: newEmail,
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
    } else {
      setMessage('Check your email to confirm the new email address.')
      setLoading(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const formData = new FormData(e.currentTarget)
    const newPassword = formData.get('password') as string

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
    } else {
      setMessage('Password updated successfully.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* User Info */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Account Information
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <p className="mt-1 text-sm text-gray-900">{user.email}</p>
          </div>
          {userData?.fullName && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <p className="mt-1 text-sm text-gray-900">
                {userData.fullName}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Account Status
            </label>
            <p className="mt-1 text-sm text-gray-900">
              {userData?.isPremium ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Premium
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  Free
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Subscription
        </h2>
        <div className="space-y-4">
          {userData?.isPremium ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Premium - {userData.subscriptionStatus || 'Active'}
                  </span>
                </p>
              </div>
              <button
                onClick={async () => {
                  setLoading(true)
                  setError(null)
                  try {
                    const response = await fetch('/api/customer-portal', {
                      method: 'POST',
                    })

                    if (!response.ok) {
                      const data = await response.json()
                      throw new Error(data.error || 'Failed to create customer portal session')
                    }

                    const { url } = await response.json()
                    if (url) {
                      window.location.href = url
                    } else {
                      throw new Error('No portal URL returned')
                    }
                  } catch (error) {
                    setError(error instanceof Error ? error.message : 'Failed to open customer portal')
                    setLoading(false)
                  }
                }}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Manage Subscription'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Current Plan
                </label>
                <p className="mt-1 text-sm text-gray-900">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    Free
                  </span>
                </p>
              </div>
              <Link
                href="/subscribe"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Upgrade to Premium →
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Update Email */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Update Email
        </h2>
        <form onSubmit={handleUpdateEmail} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              New Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Email'}
          </button>
        </form>
      </div>

      {/* Update Password */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Update Password
        </h2>
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              New Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              minLength={6}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {message && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="text-sm text-green-800">{message}</div>
        </div>
      )}

      {/* Sign Out */}
      <div>
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

