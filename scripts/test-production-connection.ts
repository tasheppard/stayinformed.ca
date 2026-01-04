#!/usr/bin/env tsx
/**
 * Test production database connection using .env.production
 */

import * as dotenv from 'dotenv'
import postgres from 'postgres'
import { getPostgresConfig, isLocalDatabase } from '../lib/db/connection-config'

// Load production environment variables
dotenv.config({ path: '.env.production' })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is not set in .env.production')
  process.exit(1)
}

console.log('🔍 Testing Production Database Connection...\n')
console.log('DATABASE_URL:', databaseUrl.replace(/:([^:@]+)@/, ':****@'))
console.log('')

const isLocal = isLocalDatabase(databaseUrl)
if (isLocal) {
  console.log('⚠️  Warning: DATABASE_URL appears to be local, not production')
  console.log('   Expected production URL pattern: *.supabase.co\n')
}

async function testProductionConnection() {
  console.log('1️⃣  Testing connection configuration...')
  
  // Ensure the URL is properly formatted (handle URL encoding if needed)
  let url = databaseUrl
  try {
    // Try to parse and reconstruct the URL to ensure proper encoding
    const urlObj = new URL(databaseUrl)
    url = urlObj.toString()
  } catch (error) {
    // If URL parsing fails, try to encode the password part
    console.log('   ⚠️  URL parsing issue detected, attempting to fix...')
    // Extract and encode password if needed
    const match = url.match(/^([^:]+:\/\/[^:]+:)([^@]+)@(.+)$/)
    if (match) {
      const encodedPassword = encodeURIComponent(match[2])
      url = `${match[1]}${encodedPassword}@${match[3]}`
      console.log('   ✅ URL encoding applied')
    }
  }
  
  const config = getPostgresConfig(url)
  console.log('   SSL:', config.ssl)
  console.log('   prepare:', config.prepare)
  console.log('   max connections:', config.max)
  console.log('   idle_timeout:', config.idle_timeout)
  console.log('   connect_timeout:', config.connect_timeout)
  console.log('')

  console.log('2️⃣  Establishing connection...')
  const client = postgres(url, config)

  try {
    // Test 1: Basic connection
    console.log('3️⃣  Testing basic query...')
    const result = await client`SELECT version() as version, current_database() as database, current_user as user, NOW() as current_time`
    console.log('   ✅ Connection successful!')
    console.log('   📊 Database:', result[0].database)
    console.log('   👤 User:', result[0].user)
    console.log('   🕐 Time:', result[0].current_time)
    console.log('   🗄️  Version:', result[0].version.split(' ')[0], result[0].version.split(' ')[1])
    console.log('')

    // Test 2: Check connection pooling info
    console.log('4️⃣  Checking connection pooling information...')
    try {
      const poolInfo = await client`
        SELECT 
          count(*) as active_connections,
          setting as max_connections
        FROM pg_stat_activity 
        CROSS JOIN pg_settings 
        WHERE datname = current_database()
          AND name = 'max_connections'
        GROUP BY setting
      `
      console.log('   📊 Active connections:', poolInfo[0]?.active_connections || 'N/A')
      console.log('   📊 Max connections:', poolInfo[0]?.max_connections || 'N/A')
      console.log('')
    } catch (error) {
      console.log('   ⚠️  Could not retrieve connection pool info:', (error as Error).message)
      console.log('')
    }

    // Test 3: Check if we can query tables
    console.log('5️⃣  Testing table access...')
    const tableCheck = await client`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    console.log('   ✅ Can access tables')
    console.log('   📋 Public tables:', tableCheck[0].count)
    console.log('')

    // Test 4: Check if drizzle schema exists
    console.log('6️⃣  Checking Drizzle migration state...')
    try {
      const migrationCheck = await client`
        SELECT COUNT(*) as count 
        FROM drizzle.__drizzle_migrations
      `
      console.log('   ✅ Drizzle migrations table accessible')
      console.log('   📋 Migration records:', migrationCheck[0].count)
      console.log('')
    } catch (error) {
      console.log('   ⚠️  Drizzle migrations table may not exist:', (error as Error).message)
      console.log('')
    }

    console.log('✅ All production connection tests passed!')
    await client.end()
    process.exit(0)

  } catch (error) {
    console.error('❌ Production connection test failed:', error)
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

testProductionConnection()
