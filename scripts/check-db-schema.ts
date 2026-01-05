#!/usr/bin/env tsx
/**
 * Check database schema to verify migrations
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' })
}

async function checkSchema() {
  const { db } = await import('../lib/db/index.js')
  const { sql } = await import('drizzle-orm')

  try {
    console.log('🔍 Checking database schema...\n')

    // Check if columns exist
    const columnsResult = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'mps'
      AND column_name IN ('person_id', 'is_active', 'status', 'photo_last_modified')
      ORDER BY column_name
    `)

    console.log('📋 Columns in mps table:')
    if (columnsResult.length === 0) {
      console.log('   ⚠️  No new columns found - migrations may not have run')
    } else {
      columnsResult.forEach((col: any) => {
        console.log(`   ✅ ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`)
      })
    }

    // Check for UNIQUE constraint on person_id
    const constraintResult = await db.execute(sql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'mps'
      AND constraint_name LIKE '%person_id%'
    `)

    console.log('\n🔒 Constraints on person_id:')
    if (constraintResult.length === 0) {
      console.log('   ⚠️  No UNIQUE constraint found on person_id - Phase 3 migration may not have run')
    } else {
      constraintResult.forEach((constraint: any) => {
        console.log(`   ✅ ${constraint.constraint_name}: ${constraint.constraint_type}`)
      })
    }

    // Check for index on person_id
    const indexResult = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'mps'
      AND indexname LIKE '%person_id%'
    `)

    console.log('\n📇 Indexes on person_id:')
    if (indexResult.length === 0) {
      console.log('   ⚠️  No index found on person_id')
    } else {
      indexResult.forEach((idx: any) => {
        console.log(`   ✅ ${idx.indexname}`)
      })
    }

    // Check MP count with personId
    const mpCount = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(person_id) as with_person_id,
        COUNT(*) - COUNT(person_id) as without_person_id
      FROM mps
    `)

    console.log('\n📊 MP Statistics:')
    if (mpCount.length > 0) {
      const stats = mpCount[0] as any
      console.log(`   Total MPs: ${stats.total}`)
      console.log(`   With personId: ${stats.with_person_id}`)
      console.log(`   Without personId: ${stats.without_person_id}`)
    }

    console.log('\n')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error checking schema:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
    }
    process.exit(1)
  }
}

checkSchema().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

