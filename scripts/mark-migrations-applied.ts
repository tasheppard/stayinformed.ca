#!/usr/bin/env tsx
/**
 * Mark existing migrations as applied in production database
 * Use this when production database was set up via Supabase migrations
 * and Drizzle needs to know which migrations have already been run
 */

import * as dotenv from 'dotenv'
import postgres from 'postgres'

// Load production environment variables
dotenv.config({ path: '.env.production' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set in .env.production')
  process.exit(1)
}

// URL-encode the DATABASE_URL to handle special characters in password
function encodeDatabaseUrl(url: string): string {
  const match = url.match(/^(postgresql?:\/\/[^:]+):([^@]+)@(.+)$/)
  if (match) {
    const [, userPart, password, rest] = match
    const encodedPassword = encodeURIComponent(password)
    return `${userPart}:${encodedPassword}@${rest}`
  }
  return url
}

const encodedUrl = encodeDatabaseUrl(process.env.DATABASE_URL)
const client = postgres(encodedUrl)

async function markMigrationsApplied() {
  console.log('🔍 Checking production database state...\n')

  try {
    // Check if drizzle schema exists
    const schemaCheck = await client`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'drizzle'
    `
    
    if (schemaCheck.length === 0) {
      console.log('📦 Creating drizzle schema...')
      await client`CREATE SCHEMA IF NOT EXISTS drizzle`
      console.log('✅ Drizzle schema created\n')
    } else {
      console.log('✅ Drizzle schema already exists\n')
    }

    // Check if migrations table exists
    const tableCheck = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'drizzle' 
      AND table_name = '__drizzle_migrations'
    `
    
    if (tableCheck.length === 0) {
      console.log('📦 Creating migrations tracking table...')
      await client`
        CREATE TABLE drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `
      console.log('✅ Migrations table created\n')
    } else {
      console.log('✅ Migrations table already exists\n')
    }

    // Check which tables already exist
    const existingTables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('bills', 'mps', 'votes', 'expenses', 'petitions')
      ORDER BY table_name
    `

    console.log(`📊 Found ${existingTables.length} existing tables:`)
    existingTables.forEach((row: any) => {
      console.log(`   - ${row.table_name}`)
    })
    console.log('')

    // Check which migrations are already recorded
    const recordedMigrations = await client`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id
    `

    console.log(`📋 Currently recorded migrations: ${recordedMigrations.length}`)
    recordedMigrations.forEach((row: any, idx: number) => {
      console.log(`   ${idx + 1}. ${row.hash.substring(0, 20)}...`)
    })
    console.log('')

    // If base tables exist but initial migration isn't recorded, mark it as applied
    if (existingTables.length > 0 && recordedMigrations.length === 0) {
      console.log('⚠️  Base tables exist but no migrations recorded')
      console.log('   This suggests the database was set up via Supabase migrations')
      console.log('')
      console.log('💡 Options:')
      console.log('   1. Mark initial migration (0000) as applied (recommended if tables match)')
      console.log('   2. Skip marking and only run new migrations (0001, 0003)')
      console.log('')
      console.log('⚠️  WARNING: Only mark migrations as applied if the schema matches!')
      console.log('')
      
      // Mark the initial migration as applied
      // Drizzle uses the migration tag as the hash
      const migrationToMark = '0000_chilly_goblin_queen'
      
      const exists = recordedMigrations.some((m: any) => m.hash === migrationToMark)
      if (!exists) {
        console.log(`📝 Marking migration "${migrationToMark}" as applied...`)
        await client`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${migrationToMark}, ${Date.now()})
        `
        console.log(`   ✅ Marked: ${migrationToMark}`)
      } else {
        console.log(`   ℹ️  Migration "${migrationToMark}" already recorded`)
      }
      console.log('')
    }

    // Show final state
    const finalMigrations = await client`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id
    `
    console.log(`✅ Final state: ${finalMigrations.length} migration(s) recorded`)
    finalMigrations.forEach((row: any, idx: number) => {
      console.log(`   ${idx + 1}. ${row.hash}`)
    })

    await client.end()
    console.log('\n✨ Done!')
    console.log('\n💡 Next step: Run new migrations with: npm run db:migrate:production')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error:', error)
    await client.end()
    process.exit(1)
  }
}

markMigrationsApplied()

