#!/usr/bin/env tsx
/**
 * Quick script to get the most recently created user email
 */

import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' })
}

async function getLatestUser() {
  const { db } = await import('../lib/db/index.js')
  const { users } = await import('../lib/db/schema.js')
  const { desc } = await import('drizzle-orm')

  try {
    const latestUsers = await db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(1)

    if (latestUsers.length === 0) {
      console.log('❌ No users found in database.')
      process.exit(1)
    }

    const user = latestUsers[0]
    console.log(`\n✅ Most recent user:`)
    console.log(`   Email: ${user.email}`)
    console.log(`   ID: ${user.id}`)
    console.log(`   Created: ${user.createdAt}`)
    console.log(`\n💡 Use this email to run the Stripe CLI test:`)
    console.log(`   npm run test:stripe:cli ${user.email}\n`)
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error fetching user:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
    }
    process.exit(1)
  }
}

getLatestUser().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

