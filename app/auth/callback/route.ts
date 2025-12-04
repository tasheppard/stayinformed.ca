import { createClient } from '../../../lib/supabase/server'
import { NextResponse } from 'next/server'
import { db } from '../../../lib/db'
import { users } from '../../../lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/account'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Create or update user record in database
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, data.user.id))
        .limit(1)

      if (existingUser.length === 0) {
        // Create new user record
        await db.insert(users).values({
          id: data.user.id,
          email: data.user.email!,
          fullName: data.user.user_metadata?.full_name || null,
          isPremium: false,
        })
      } else {
        // Update existing user record if email changed
        await db
          .update(users)
          .set({
            email: data.user.email!,
            updatedAt: new Date(),
          })
          .where(eq(users.id, data.user.id))
      }

      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL('/auth/auth-code-error', requestUrl.origin))
}

