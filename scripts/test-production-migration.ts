#!/usr/bin/env tsx
/**
 * Test production database migrations using .env.production
 */

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getPostgresConfig } from '../lib/db/connection-config'

// Load production environment variables
dotenv.config({ path: '.env.production' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set in .env.production')
  process.exit(1)
}

// Ensure the URL is properly formatted
let databaseUrl = process.env.DATABASE_URL
try {
  const urlObj = new URL(databaseUrl)
  databaseUrl = urlObj.toString()
} catch (error) {
  // Try to encode password if URL parsing fails
  const match = databaseUrl.match(/^([^:]+:\/\/[^:]+:)([^@]+)@(.+)$/)
  if (match) {
    const encodedPassword = encodeURIComponent(match[2])
    databaseUrl = `${match[1]}${encodedPassword}@${match[3]}`
  }
}

console.log('🔍 Testing Production Database Migrations...\n')
console.log('DATABASE_URL:', databaseUrl.replace(/:([^:@]+)@/, ':****@'))
console.log('')

const config = getPostgresConfig(databaseUrl)
console.log('Connection Configuration:')
console.log('  SSL:', config.ssl)
console.log('  prepare:', config.prepare)
console.log('  max:', config.max)
console.log('')

const client = postgres(databaseUrl, config)
const db = drizzle(client)

async function testMigrations() {
  console.log('Running migrations against production database...')
  try {
    await migrate(db, { migrationsFolder: './lib/db/migrations' })
    console.log('✅ Migrations completed successfully')
    await client.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      if (error.message.includes('SSL')) {
        console.error('   💡 Tip: Check SSL configuration for production connections')
      }
      if (error.message.includes('prepare')) {
        console.error('   💡 Tip: Ensure prepare: false is set for Transaction Pooler')
      }
    }
    await client.end()
    process.exit(1)
  }
}

testMigrations()

