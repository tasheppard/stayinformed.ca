import { createClient } from '../supabase/server'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export async function getUserWithPremium() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, isPremium: false }
  }

  // Get user record from database to check premium status
  const userRecord = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  const isPremium = userRecord[0]?.isPremium ?? false

  return { user, isPremium }
}

