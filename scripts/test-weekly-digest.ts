#!/usr/bin/env tsx
/**
 * Test script to send a weekly digest email to a test account.
 *
 * Usage:
 *   TEST_USER_EMAIL="user@example.com" npm run test:weekly-digest
 *   TEST_USER_ID="uuid" npm run test:weekly-digest
 *
 * Optional:
 *   TEST_DIGEST_EMAIL="deliver-to@example.com" (override recipient)
 */
import * as dotenv from 'dotenv'

// Load environment variables FIRST before importing modules that depend on them
dotenv.config({ path: '.env.local' })
if (!process.env.RESEND_API_KEY) {
  dotenv.config({ path: '.env' })
}

import { eq, and, sql } from 'drizzle-orm'
import { db } from '../lib/db'
import { users, emailSubscriptions } from '../lib/db/schema'
import { generateWeeklyDigest } from '../lib/email/weekly-digest'
import { resend, EMAIL_CONFIG } from '../lib/email/resend-client'

async function testWeeklyDigest() {
  console.log('🧪 Testing Weekly Digest Email...\n')

  const testUserEmail = process.env.TEST_USER_EMAIL
  const testUserId = process.env.TEST_USER_ID
  const overrideRecipient = process.env.TEST_DIGEST_EMAIL

  if (!testUserEmail && !testUserId) {
    console.error('❌ Missing test user configuration')
    console.error('   Set TEST_USER_EMAIL or TEST_USER_ID in your environment')
    process.exit(1)
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY environment variable is not set')
    console.error('   Please add it to your .env.local file')
    process.exit(1)
  }

  const userRecord = await db
    .select()
    .from(users)
    .where(testUserId ? eq(users.id, testUserId) : eq(users.email, testUserEmail!))
    .limit(1)

  if (userRecord.length === 0) {
    console.error('❌ Test user not found')
    console.error(
      `   Tried ${testUserId ? `TEST_USER_ID=${testUserId}` : `TEST_USER_EMAIL=${testUserEmail}`}`
    )
    process.exit(1)
  }

  const user = userRecord[0]
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(emailSubscriptions)
    .where(and(eq(emailSubscriptions.userId, user.id), eq(emailSubscriptions.isActive, true)))

  if (Number(count) === 0) {
    console.error('❌ Test user has no active email subscriptions')
    console.error('   Follow at least one MP before running this test')
    process.exit(1)
  }

  const digest = await generateWeeklyDigest(user.id)
  if (!digest) {
    console.error('❌ Weekly digest generation returned null')
    console.error('   Ensure the user has active subscriptions and recent activity')
    process.exit(1)
  }

  const recipient = overrideRecipient || user.email
  const emailDate = new Date().toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })

  console.log(`📧 Sending digest for: ${user.email}`)
  if (overrideRecipient) {
    console.log(`   Overriding recipient to: ${overrideRecipient}`)
  }

  const { data, error } = await resend.emails.send({
    from: EMAIL_CONFIG.from,
    to: recipient,
    subject: `Test Weekly Digest - ${emailDate}`,
    html: digest.html,
    text: digest.text,
  })

  if (error) {
    console.error('❌ Error sending weekly digest:', error)
    process.exit(1)
  }

  console.log('✅ Weekly digest sent successfully!')
  console.log(`   Email ID: ${data?.id}`)
  console.log(`\n📬 Check the inbox at: ${recipient}`)
}

testWeeklyDigest().catch((error) => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
