'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { MPCard } from '@/components/ui/MPCard'
import Fuse from 'fuse.js'

interface UserData {
  id: string
  email: string
  fullName: string | null
  isPremium: boolean
  subscriptionStatus: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

interface EmailSubscription {
  id: number
  mpId: number
  isActive: boolean
  mp: {
    id: number
    fullName: string
    slug: string
    constituencyName: string
    province: string
    caucusShortName: string | null
    photoUrl: string | null
  }
}

interface MP {
  id: number
  fullName: string
  slug: string
  constituencyName: string
  province: string
  caucusShortName: string | null
  photoUrl: string | null
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

  // Email subscriptions state
  const [emailSubscriptions, setEmailSubscriptions] = useState<EmailSubscription[]>([])
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MP[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [allMPs, setAllMPs] = useState<MP[]>([])

  // Show success message if redirected from successful checkout
  useEffect(() => {
    if (sessionId) {
      setMessage('Subscription activated successfully! Welcome to Premium.')
      // Refresh user data
      router.refresh()
    }
  }, [sessionId, router])

  // Load email subscriptions
  useEffect(() => {
    const loadSubscriptions = async () => {
      try {
        setLoadingSubscriptions(true)
        const response = await fetch('/api/email-subscriptions')
        if (response.ok) {
          const data = await response.json()
          setEmailSubscriptions(data.subscriptions || [])
        } else {
          console.error('Failed to load email subscriptions')
        }
      } catch (error) {
        console.error('Error loading email subscriptions:', error)
      } finally {
        setLoadingSubscriptions(false)
      }
    }
    loadSubscriptions()
  }, [])

  // Load all MPs for search (only once)
  useEffect(() => {
    const loadMPs = async () => {
      try {
        const response = await fetch('/api/mp/search?q=&limit=338')
        if (response.ok) {
          const data = await response.json()
          setAllMPs(data.results || [])
        }
      } catch (error) {
        console.error('Error loading MPs:', error)
      }
    }
    loadMPs()
  }, [])

  // Fuzzy search with Fuse.js
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    // Filter out MPs that are already subscribed
    const subscribedMpIds = new Set(emailSubscriptions.map((sub) => sub.mpId))
    const availableMPs = allMPs.filter((mp) => !subscribedMpIds.has(mp.id))

    const fuse = new Fuse(availableMPs, {
      keys: ['fullName', 'constituencyName', 'province'],
      threshold: 0.3,
      includeScore: true,
    })

    const results = fuse.search(searchQuery)
    const filtered = results.map((result) => result.item).slice(0, 10)
    setSearchResults(filtered)
  }, [searchQuery, allMPs, emailSubscriptions])

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (
        !target.closest('.email-search-container') &&
        !target.closest('.email-search-dropdown')
      ) {
        setShowSearch(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const handleUnsubscribe = async (mpId: number) => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/email-subscriptions?mpId=${mpId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to unsubscribe')
      }

      // Remove from local state
      setEmailSubscriptions((prev) =>
        prev.filter((sub) => sub.mpId !== mpId)
      )
      setMessage('Unsubscribed from MP updates')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to unsubscribe')
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribe = async (mpId: number) => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/email-subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mpId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to subscribe')
      }

      // Reload subscriptions to get the new one
      const subResponse = await fetch('/api/email-subscriptions')
      if (subResponse.ok) {
        const data = await subResponse.json()
        setEmailSubscriptions(data.subscriptions || [])
      }

      setSearchQuery('')
      setSearchResults([])
      setShowSearch(false)
      setMessage('Subscribed to MP updates')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to subscribe')
    } finally {
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
              <div className="mt-4">
                <Link
                  href="/compare"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Compare MPs →
                </Link>
              </div>
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

      {/* Email Preferences */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Email Preferences
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Subscribe to weekly email digests for MPs you want to follow. You'll
          receive updates every Friday with their recent activity.
        </p>

        {/* Current Subscriptions */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Following ({emailSubscriptions.length})
          </h3>
          {loadingSubscriptions ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : emailSubscriptions.length === 0 ? (
            <div className="text-sm text-gray-500 mb-4">
              You're not following any MPs yet. Search below to get started!
            </div>
          ) : (
            <div className="space-y-3">
              {emailSubscriptions.map((subscription) => (
                <div
                  key={subscription.id}
                  className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                >
                  <div className="flex-1">
                    <MPCard
                      id={subscription.mp.id}
                      fullName={subscription.mp.fullName}
                      slug={subscription.mp.slug}
                      constituencyName={subscription.mp.constituencyName}
                      province={subscription.mp.province}
                      caucusShortName={subscription.mp.caucusShortName}
                      photoUrl={subscription.mp.photoUrl}
                      className="border-0 shadow-none bg-transparent p-0"
                    />
                  </div>
                  <button
                    onClick={() => handleUnsubscribe(subscription.mpId)}
                    disabled={loading}
                    className="ml-4 text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    Unsubscribe
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search and Subscribe */}
        <div className="email-search-container">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Follow a New MP
          </h3>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowSearch(true)
              }}
              onFocus={() => setShowSearch(true)}
              placeholder="Search by MP name or riding..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {showSearch && searchQuery && searchResults.length > 0 && (
              <div className="email-search-dropdown absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                {searchResults.map((mp) => (
                  <div
                    key={mp.id}
                    className="p-2 hover:bg-blue-50 cursor-pointer"
                    onClick={() => handleSubscribe(mp.id)}
                  >
                    <MPCard
                      id={mp.id}
                      fullName={mp.fullName}
                      slug={mp.slug}
                      constituencyName={mp.constituencyName}
                      province={mp.province}
                      caucusShortName={mp.caucusShortName}
                      photoUrl={mp.photoUrl}
                      className="border-0 shadow-none bg-transparent p-0"
                    />
                  </div>
                ))}
              </div>
            )}
            {showSearch && searchQuery && searchResults.length === 0 && (
              <div className="email-search-dropdown absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                No MPs found matching &quot;{searchQuery}&quot;
              </div>
            )}
          </div>
          {searchQuery && searchResults.length === 0 && allMPs.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Tip: Try searching by MP name, riding name, or province
            </p>
          )}
        </div>
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

