#!/usr/bin/env tsx
/**
 * Sync users from Supabase Auth to the users table in the database
 * 
 * This script:
 * 1. Queries Supabase Auth to get all users
 * 2. Creates user records in the database for any users that don't exist
 * 3. Updates existing user records if email changed
 * 
 * Usage:
 *   tsx scripts/sync-users-from-auth.ts
 */

import * as dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
dotenv.config({ path: '.env.local' })
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  dotenv.config({ path: '.env' })
}

async function syncUsersFromAuth() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL not set in environment variables')
    process.exit(1)
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set in environment variables')
    console.error('   This key is required to query Supabase Auth.')
    console.error('   For local Supabase, run: tsx scripts/generate-service-role-key.ts')
    console.error('   For production, get it from your Supabase dashboard')
    process.exit(1)
  }

  // Dynamic imports after env vars are loaded
  const { createClient } = await import('@supabase/supabase-js')
  const { db } = await import('../lib/db/index.js')
  const { users } = await import('../lib/db/schema.js')
  const { eq } = await import('drizzle-orm')

  console.log('🔄 Syncing users from Supabase Auth to database...\n')

  try {
    // Create Supabase admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get all users from Supabase Auth
    console.log('📥 Fetching users from Supabase Auth...')
    const { data: authData, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      throw new Error(`Failed to query Supabase Auth: ${listError.message}`)
    }

    const authUsers = authData.users
    console.log(`   Found ${authUsers.length} user(s) in Supabase Auth\n`)

    if (authUsers.length === 0) {
      console.log('✅ No users to sync. Database is up to date.\n')
      process.exit(0)
    }

    // Get all existing users from database
    const dbUsers = await db.select({ id: users.id, email: users.email }).from(users)
    const dbUserMap = new Map(dbUsers.map((u) => [u.id, u.email]))

    let created = 0
    let updated = 0
    let skipped = 0

    // Process each auth user
    for (const authUser of authUsers) {
      if (!authUser.email) {
        console.log(`⚠️  Skipping user ${authUser.id} - no email address`)
        skipped++
        continue
      }

      const existsInDb = dbUserMap.has(authUser.id)
      const existingEmail = dbUserMap.get(authUser.id)

      if (existsInDb && existingEmail === authUser.email) {
        // User exists and email matches - skip
        skipped++
        continue
      }

      try {
        if (existsInDb) {
          // Update existing user (email changed)
          await db
            .update(users)
            .set({
              email: authUser.email,
              fullName: authUser.user_metadata?.full_name || null,
              updatedAt: new Date(),
            })
            .where(eq(users.id, authUser.id))
          console.log(`   ✅ Updated: ${authUser.email}`)
          updated++
        } else {
          // Create new user record
          await db.insert(users).values({
            id: authUser.id,
            email: authUser.email,
            fullName: authUser.user_metadata?.full_name || null,
            isPremium: false,
          })
          console.log(`   ✅ Created: ${authUser.email}`)
          created++
        }
      } catch (error: any) {
        if (error?.code === '23505') {
          // Unique constraint violation - user was created between our checks
          console.log(`   ⚠️  User ${authUser.email} already exists (race condition), skipping`)
          skipped++
        } else {
          console.error(`   ❌ Failed to sync ${authUser.email}: ${error.message}`)
        }
      }
    }

    console.log('\n✅ Sync complete!')
    console.log(`   Created: ${created}`)
    console.log(`   Updated: ${updated}`)
    console.log(`   Skipped: ${skipped}`)
    console.log(`   Total: ${authUsers.length}\n`)

    // Show all users in database
    const allDbUsers = await db.select({ email: users.email, id: users.id }).from(users)
    console.log(`📊 Total users in database: ${allDbUsers.length}`)
    if (allDbUsers.length > 0) {
      console.log('\n   Users:')
      allDbUsers.forEach((u) => {
        console.log(`     - ${u.email} (ID: ${u.id})`)
      })
    }

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error syncing users:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    process.exit(1)
  }
}

syncUsersFromAuth().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

