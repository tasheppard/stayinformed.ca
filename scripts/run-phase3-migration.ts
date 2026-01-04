#!/usr/bin/env tsx
/**
 * Run Phase 3 migration manually to add UNIQUE constraint and index on personId
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' })
}

async function runPhase3() {
  const { db } = await import('../lib/db/index.js')
  const { sql } = await import('drizzle-orm')

  try {
    console.log('🔧 Running Phase 3 migration: Adding UNIQUE constraint and index on personId...\n')

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

    console.log('\n✅ Phase 3 migration completed successfully!')
    console.log('\n📇 Created indexes:')
    afterCheck.forEach((idx: any) => {
      console.log(`   - ${idx.indexname}`)
    })

    console.log('\n')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error running Phase 3 migration:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    process.exit(1)
  }
}

runPhase3()

