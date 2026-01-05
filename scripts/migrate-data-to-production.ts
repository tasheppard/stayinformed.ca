#!/usr/bin/env tsx
/**
 * Migrate all data from local database to production
 * 
 * This script:
 * 1. Reads all data from local database (.env.local)
 * 2. Writes all data to production database (.env.production)
 * 3. Handles foreign key constraints and table dependencies
 * 
 * Usage:
 *   tsx scripts/migrate-data-to-production.ts
 * 
 * WARNING: This will overwrite production data!
 */

import * as dotenv from 'dotenv'
import postgres from 'postgres'

// Load local environment variables
dotenv.config({ path: '.env.local' })
const localDbUrl = process.env.DATABASE_URL

if (!localDbUrl) {
  console.error('❌ DATABASE_URL not found in .env.local')
  process.exit(1)
}

// Load production environment variables
dotenv.config({ path: '.env.production' })
const productionDbUrl = process.env.DATABASE_URL

if (!productionDbUrl) {
  console.error('❌ DATABASE_URL not found in .env.production')
  process.exit(1)
}

// URL-encode database URLs
function encodeDatabaseUrl(url: string): string {
  const match = url.match(/^(postgresql?:\/\/[^:]+):([^@]+)@(.+)$/)
  if (match) {
    const [, userPart, password, rest] = match
    const encodedPassword = encodeURIComponent(password)
    return `${userPart}:${encodedPassword}@${rest}`
  }
  return url
}

const localClient = postgres(encodeDatabaseUrl(localDbUrl))
const productionClient = postgres(encodeDatabaseUrl(productionDbUrl))

// Table order matters for foreign key constraints
const tableOrder = [
  'mps',                    // No dependencies
  'riding_boundaries',      // No dependencies
  'votes',                  // Depends on mps
  'bills',                  // Depends on mps
  'expenses',               // Depends on mps
  'petitions',              // Depends on mps
  'committee_participation', // Depends on mps
  'calculated_scores',      // Depends on mps
  'scoring_weights',        // No dependencies
  'email_subscriptions',    // Depends on mps (and users, but users handled by Supabase Auth)
]

async function migrateTable(tableName: string) {
  console.log(`\n📦 Migrating table: ${tableName}...`)

  try {
    // Get all data from local using unsafe query for dynamic table name
    const localData = await localClient.unsafe(`SELECT * FROM ${tableName}`)
    console.log(`   📥 Found ${localData.length} rows in local database`)

    if (localData.length === 0) {
      console.log(`   ⏭️  Skipping (no data)`)
      return { copied: 0, skipped: 0 }
    }

    // Clear existing data in production
    console.log(`   🗑️  Clearing existing data in production...`)
    await productionClient.unsafe(`DELETE FROM ${tableName}`)
    console.log(`   ✅ Cleared production table`)

    // Insert data into production in batches
    const batchSize = 100
    let copied = 0
    
    for (let i = 0; i < localData.length; i += batchSize) {
      const batch = localData.slice(i, i + batchSize)
      
      // Get column names from first row
      const columns = Object.keys(batch[0])
      
      // Build values array for this batch
      const values: any[] = []
      const placeholders: string[] = []
      let paramCounter = 1
      
      batch.forEach((row) => {
        const rowPlaceholders: string[] = []
        columns.forEach((col) => {
          values.push(row[col])
          rowPlaceholders.push(`$${paramCounter}`)
          paramCounter++
        })
        placeholders.push(`(${rowPlaceholders.join(', ')})`)
      })
      
      const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`
      
      await productionClient.unsafe(query, values)
      copied += batch.length
      console.log(`   📤 Inserted batch: ${copied}/${localData.length} rows`)
    }
    
    console.log(`   ✅ Copied ${copied} rows to production`)
    return { copied, skipped: 0 }
  } catch (error) {
    console.error(`   ❌ Error migrating ${tableName}:`, error)
    if (error instanceof Error) {
      console.error(`      ${error.message}`)
    }
    throw error
  }
}

async function migrateAllData() {
  console.log('🚀 Starting data migration from local to production...\n')
  console.log('⚠️  WARNING: This will overwrite production data!\n')

  try {
    // Verify connections
    console.log('🔍 Verifying database connections...')
    const localTest = await localClient.unsafe(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`
    )
    const prodTest = await productionClient.unsafe(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`
    )
    console.log(`   ✅ Local: ${localTest[0].count} tables`)
    console.log(`   ✅ Production: ${prodTest[0].count} tables\n`)

    const results: Record<string, { copied: number; skipped: number }> = {}

    // Migrate tables in order
    for (const tableName of tableOrder) {
      try {
        // Check if table exists in both databases
        const localExists = await localClient.unsafe(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [tableName]
        )
        const prodExists = await productionClient.unsafe(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [tableName]
        )

        if (!localExists[0].exists) {
          console.log(`   ⏭️  Table ${tableName} doesn't exist in local, skipping`)
          continue
        }

        if (!prodExists[0].exists) {
          console.log(`   ⚠️  Table ${tableName} doesn't exist in production, skipping`)
          continue
        }

        results[tableName] = await migrateTable(tableName)
      } catch (error) {
        console.error(`\n❌ Failed to migrate ${tableName}:`, error)
        // Continue with other tables
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 Migration Summary:')
    console.log('='.repeat(60))
    let totalCopied = 0
    for (const [table, result] of Object.entries(results)) {
      console.log(`   ${table}: ${result.copied} rows copied`)
      totalCopied += result.copied
    }
    console.log('='.repeat(60))
    console.log(`✅ Total: ${totalCopied} rows migrated`)
    console.log('='.repeat(60) + '\n')

    // Reset sequences for tables with serial IDs
    console.log('🔄 Resetting sequences...')
    for (const tableName of tableOrder) {
      try {
        // Get the primary key column (usually 'id')
        const pkInfo = await productionClient.unsafe(
          `SELECT column_name 
           FROM information_schema.columns 
           WHERE table_schema = 'public' 
           AND table_name = $1 
           AND column_default LIKE 'nextval%'
           LIMIT 1`,
          [tableName]
        )
        
        if (pkInfo.length > 0) {
          const pkColumn = pkInfo[0].column_name
          const maxId = await productionClient.unsafe(
            `SELECT COALESCE(MAX(${pkColumn}), 0) as max_id FROM ${tableName}`
          )
          const nextVal = maxId[0].max_id + 1
          await productionClient.unsafe(
            `SELECT setval(pg_get_serial_sequence('${tableName}', '${pkColumn}'), $1, false)`,
            [nextVal]
          )
          console.log(`   ✅ Reset sequence for ${tableName}`)
        }
      } catch (error) {
        // Ignore errors for sequence reset (table might not have serial)
      }
    }
    console.log('')

    await localClient.end()
    await productionClient.end()

    console.log('✨ Data migration completed!')
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    await localClient.end()
    await productionClient.end()
    process.exit(1)
  }
}

migrateAllData()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })

