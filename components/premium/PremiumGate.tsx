'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { useState, useEffect } from 'react'

interface PremiumGateProps {
  children: React.ReactNode
  featureName: string
  message?: string
}

export function PremiumGate({ children, featureName, message }: PremiumGateProps) {
  const { user, loading } = useAuth()
  const [isPremium, setIsPremium] = useState(false)
  const [isLoadingPremium, setIsLoadingPremium] = useState(true)

  useEffect(() => {
    async function checkPremium() {
      if (!user) {
        setIsPremium(false)
        setIsLoadingPremium(false)
        return
      }

      try {
        const response = await fetch('/api/user/premium-status')
        if (response.ok) {
          const data = await response.json()
          setIsPremium(data.isPremium)
        }
      } catch (error) {
        console.error('Error checking premium status:', error)
        setIsPremium(false)
      } finally {
        setIsLoadingPremium(false)
      }
    }

    checkPremium()
  }, [user])

  const isLoading = loading || isLoadingPremium

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-sm text-yellow-800 mb-4">
          {message || `Please sign in to access ${featureName}.`}
        </p>
        <Link
          href="/login?redirect=/subscribe"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          Sign In
        </Link>
      </div>
    )
  }

  if (!isPremium) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Premium Feature
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {message || `${featureName} is available for Premium subscribers.`}
            </p>
            <Link
              href="/subscribe"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Upgrade to Premium →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

