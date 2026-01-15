'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SubscribePageClient() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubscribe = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create checkout session')
      }

      const { url } = await response.json()
      if (url) {
        window.location.href = url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const premiumFeatures = [
    {
      title: 'Historical Data',
      description: 'Access voting records and data from the past 3 parliaments',
      icon: '📚',
    },
    {
      title: 'Detailed Expense Breakdowns',
      description: 'See transaction-level details for all MP expenses',
      icon: '💰',
    },
    {
      title: 'Advanced Comparisons',
      description: 'Compare multiple MPs side-by-side with custom metrics',
      icon: '📊',
    },
    {
      title: 'CSV Data Exports',
      description: 'Download voting records, expenses, and scores as CSV files',
      icon: '💾',
    },
    {
      title: 'Ad-Free Experience',
      description: 'Enjoy the platform without any advertisements',
      icon: '✨',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Pricing Card */}
      <div className="border-2 border-blue-500 rounded-lg p-6 bg-blue-50">
        <div className="text-center">
          <div className="text-5xl font-bold text-gray-900 mb-2">$4.99</div>
          <div className="text-gray-600 mb-6">per month</div>
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full inline-flex justify-center py-3 px-6 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Subscribe to Premium'}
          </button>
          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}
        </div>
      </div>

      {/* Features List */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Premium Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {premiumFeatures.map((feature, index) => (
            <div
              key={index}
              className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg"
            >
              <div className="text-2xl flex-shrink-0">{feature.icon}</div>
              <div>
                <h3 className="font-medium text-gray-900">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What's Included in Free */}
      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Free users get:
        </h2>
        <ul className="space-y-2 text-gray-600">
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            Current session MP profiles (all 4 tabs)
          </li>
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            Accountability scores and basic analytics
          </li>
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            Weekly email digests
          </li>
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            One-tap MP discovery via location
          </li>
        </ul>
      </div>

      {/* Cancel Anytime */}
      <div className="text-center text-sm text-gray-500">
        Cancel anytime. No questions asked.
        <Link href="/account" className="ml-2 text-blue-600 hover:text-blue-500">
          View your account →
        </Link>
      </div>
    </div>
  )
}

