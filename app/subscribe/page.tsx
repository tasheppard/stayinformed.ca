import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SubscribePageClient from './SubscribePageClient'

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: { canceled?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=/subscribe')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Upgrade to Premium
            </h1>
            <p className="text-gray-600 mb-8">
              Unlock advanced features and historical data
            </p>

            {searchParams.canceled === 'true' && (
              <div className="rounded-md bg-yellow-50 p-4 mb-6">
                <div className="text-sm text-yellow-800">
                  Checkout was canceled. No charges were made.
                </div>
              </div>
            )}

            <SubscribePageClient />
          </div>
        </div>
      </div>
    </div>
  )
}

