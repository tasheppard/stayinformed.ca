#!/usr/bin/env tsx
/**
 * Run Phase 3 migration on production database
 * Adds UNIQUE constraint and index on personId
 * 
 * WARNING: This will modify the production database!
 */

import * as dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'

// Load production environment variables FIRST
dotenv.config({ path: '.env.production' })
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env.production')
  process.exit(1)
}

// URL-encode the DATABASE_URL to handle special characters in password
// This is especially important for Supabase URLs which may contain special chars like ?
function encodeDatabaseUrl(url: string): string {
  // Match: postgresql://user:password@host:port/db
  const match = url.match(/^(postgresql?:\/\/[^:]+):([^@]+)@(.+)$/)
  if (match) {
    const [, userPart, password, rest] = match
    // URL-encode the password
    const encodedPassword = encodeURIComponent(password)
    return `${userPart}:${encodedPassword}@${rest}`
  }
  return url
}

const encodedUrl = encodeDatabaseUrl(process.env.DATABASE_URL || '')
const client = postgres(encodedUrl)
const db = drizzle(client)

async function runPhase3Production() {

  try {
    console.log('🚀 Running Phase 3 migration on PRODUCTION database...\n')

    // Verify this is production
    const dbUrl = process.env.DATABASE_URL || ''
    if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
      console.warn('⚠️  WARNING: DATABASE_URL appears to be localhost')
      console.warn('   Use npm run db:migrate:phase3 for local database')
    }

    // Check current state
    const beforeCheck = await db.execute(sql`
      SELECT COUNT(*) as total, COUNT(DISTINCT person_id) as unique_person_ids
      FROM mps
      WHERE person_id IS NOT NULL
    `)
    const before = beforeCheck[0] as any
    console.log(`📊 Before: ${before.total} MPs with personId, ${before.unique_person_ids} unique personIds`)

    if (before.total !== before.unique_person_ids) {
      console.error(`\n❌ ERROR: Found duplicate personIds! Cannot add UNIQUE constraint.`)
      console.error(`   Please resolve duplicates before running this migration.`)
      process.exit(1)
    }

    // Add UNIQUE index (constraint)
    console.log('\n1️⃣  Creating UNIQUE index on person_id...')
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "mps_person_id_unique" 
      ON "mps" ("person_id") 
      WHERE "person_id" IS NOT NULL
    `)
    console.log('   ✅ UNIQUE index created')

    // Add regular index for lookups
    console.log('\n2️⃣  Creating lookup index on person_id...')
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "mps_person_id_idx" 
      ON "mps" ("person_id")
    `)
    console.log('   ✅ Lookup index created')

    // Verify
    const afterCheck = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'mps'
      AND indexname LIKE '%person_id%'
    `)

    console.log('\n✅ Phase 3 production migration completed successfully!')
    console.log('\n📇 Created indexes:')
    afterCheck.forEach((idx: any) => {
      console.log(`   - ${idx.indexname}`)
    })

    console.log('\n')
    await client.end()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error running Phase 3 production migration:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    await client.end()
    process.exit(1)
  }
}

runPhase3Production()

