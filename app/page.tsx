import { UseMyLocationButton } from '@/components/search/UseMyLocationButton'
import { PostalCodeSearch } from '@/components/search/PostalCodeSearch'
import { MPSearchDropdown } from '@/components/search/MPSearchDropdown'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-12 md:py-24">
        <div className="max-w-2xl mx-auto text-center">
          {/* Hero Section */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            StayInformed.ca
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-12">
            The easiest way for Canadians to track their MP&apos;s performance
          </p>

          {/* Search Options */}
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Find Your MP
              </h2>

              {/* Use My Location */}
              <div className="mb-6">
                <UseMyLocationButton />
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* Postal Code Search */}
              <div className="mb-6">
                <PostalCodeSearch />
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* MP Name Search */}
              <div>
                <MPSearchDropdown />
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-white rounded-lg p-6 shadow-md">
              <div className="text-3xl mb-3">📍</div>
              <h3 className="font-semibold text-gray-900 mb-2">
                One-Tap Discovery
              </h3>
              <p className="text-sm text-gray-600">
                Find your MP instantly using your location or postal code
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-md">
              <div className="text-3xl mb-3">📊</div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Comprehensive Data
              </h3>
              <p className="text-sm text-gray-600">
                View voting records, expenses, and accountability scores
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-md">
              <div className="text-3xl mb-3">📧</div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Stay Updated
              </h3>
              <p className="text-sm text-gray-600">
                Get weekly email digests of your MP&apos;s activity
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
