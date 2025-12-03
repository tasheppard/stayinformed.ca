'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function UseMyLocationButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleClick = async () => {
    setLoading(true)
    setError(null)

    try {
      // Request user's location
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'))
            return
          }

          navigator.geolocation.getCurrentPosition(
            resolve,
            (err) => {
              switch (err.code) {
                case err.PERMISSION_DENIED:
                  reject(
                    new Error(
                      'Location access denied. Please enable location permissions in your browser settings.'
                    )
                  )
                  break
                case err.POSITION_UNAVAILABLE:
                  reject(
                    new Error(
                      'Location information is unavailable. Please try again.'
                    )
                  )
                  break
                case err.TIMEOUT:
                  reject(
                    new Error(
                      'Location request timed out. Please try again.'
                    )
                  )
                  break
                default:
                  reject(
                    new Error(
                      'An unknown error occurred while getting your location.'
                    )
                  )
              }
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            }
          )
        }
      )

      const { latitude, longitude } = position.coords

      // Call geolocation API
      const response = await fetch(
        `/api/geolocation?lat=${latitude}&lng=${longitude}`
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

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        aria-label="Use my location to find my MP"
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Finding your MP...</span>
          </>
        ) : (
          <>
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>Use My Location</span>
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

