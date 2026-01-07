import { Metadata } from 'next'
import { PremiumGate } from '@/components/premium/PremiumGate'
import { CompareMPsClient } from './CompareMPsClient'

export const metadata: Metadata = {
  title: 'Compare MPs | StayInformed.ca',
  description:
    'Compare accountability scores, voting records, expenses, and performance metrics across multiple Members of Parliament.',
}

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Compare MPs
          </h1>
          <p className="text-gray-600">
            Compare accountability scores, voting records, expenses, and
            performance metrics across multiple Members of Parliament.
          </p>
        </div>

        <PremiumGate
          featureName="Multi-MP Comparison Tool"
          message="Compare multiple MPs side-by-side with advanced comparison tools. Upgrade to Premium to access this feature."
        >
          <CompareMPsClient />
        </PremiumGate>
      </div>
    </div>
  )
}

