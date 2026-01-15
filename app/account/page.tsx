import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { db } from '../../lib/db'
import { users } from '../../lib/db/schema'
import { eq } from 'drizzle-orm'
import AccountSettingsClient from './AccountSettingsClient'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { session_id?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user record from database
  const userRecord = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  const userData = userRecord[0] || null

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              Account Settings
            </h1>
            <AccountSettingsClient
              user={user}
              userData={userData}
              supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
              sessionId={searchParams.session_id}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

