import { createClient } from '../supabase/server'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export async function getUserSubscriptionStatus(userId: string) {
  const userRecord = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (userRecord.length === 0) {
    return {
      isPremium: false,
      subscriptionStatus: null,
    }
  }

  return {
    isPremium: userRecord[0].isPremium,
    subscriptionStatus: userRecord[0].subscriptionStatus,
  }
}

export async function requireAuth() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return user
}

export async function requirePremium() {
  const user = await requireAuth()
  const subscription = await getUserSubscriptionStatus(user.id)

  if (!subscription.isPremium) {
    throw new Error('Premium subscription required')
  }

  return { user, subscription }
}

