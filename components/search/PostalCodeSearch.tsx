'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PostalCodeSearch() {
  const [postalCode, setPostalCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Call geolocation API with postal code
      const response = await fetch(
        `/api/geolocation?postalCode=${encodeURIComponent(postalCode.trim())}`
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to find your MP')
      }

      const result = await response.json()

      // Reset loading state before navigation
      setLoading(false)

      // Redirect to MP profile page
      router.push(`/mp/${result.mp.slug}`)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred while finding your MP'
      )
      setLoading(false)
    }
  }

  const formatPostalCode = (value: string) => {
    // Remove all non-alphanumeric characters
    const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()

    // Format as A1A 1A1
    if (cleaned.length <= 3) {
      return cleaned
    } else if (cleaned.length <= 6) {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`
    } else {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)}`
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPostalCode(e.target.value)
    setPostalCode(formatted)
    setError(null)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={postalCode}
          onChange={handleChange}
          placeholder="Enter postal code (e.g., K1A 0A6)"
          maxLength={7}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Postal code"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || postalCode.trim().length < 6}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

