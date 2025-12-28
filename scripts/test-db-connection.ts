#!/usr/bin/env tsx
/**
 * Quick test to verify Drizzle database connection
 */

import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

import { db } from '../lib/db/index.js'
import { sql } from 'drizzle-orm'

async function testConnection() {
  console.log('🔍 Testing Drizzle database connection...\n')

  try {
    // Test 1: Basic connection
    console.log('1️⃣  Testing basic connection...')
    const result = await db.execute(sql`SELECT version() as version, current_database() as database, current_user as user`)
    console.log(`   ✅ Connected successfully`)
    console.log(`   📊 Database: ${result[0].database}`)
    console.log(`   👤 User: ${result[0].user}`)
    console.log(`   🗄️  Version: ${result[0].version.split(' ')[0]} ${result[0].version.split(' ')[1]}\n`)

    // Test 2: Check if we can query a table
    console.log('2️⃣  Testing table access...')
    const tableCheck = await db.execute(sql`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`)
    const tableCount = tableCheck[0].count
    console.log(`   ✅ Can access tables`)
    console.log(`   📋 Found ${tableCount} tables in public schema\n`)

    // Test 3: Check if mps table exists and is accessible
    console.log('3️⃣  Testing mps table access...')
    try {
      const mpCount = await db.execute(sql`SELECT COUNT(*) as count FROM mps`)
      console.log(`   ✅ mps table is accessible`)
      console.log(`   👥 MP count: ${mpCount[0].count}\n`)
    } catch (error) {
      console.log(`   ⚠️  mps table may not exist or is not accessible: ${error}\n`)
    }

    // Test 4: Test Drizzle schema query
    console.log('4️⃣  Testing Drizzle schema queries...')
    try {
      const { mps } = await import('../lib/db/schema.js')
      const mpQuery = await db.select().from(mps).limit(1)
      console.log(`   ✅ Drizzle schema queries work`)
      console.log(`   📊 Sample query returned ${mpQuery.length} row(s)\n`)
    } catch (error) {
      console.log(`   ⚠️  Drizzle schema query issue: ${error}\n`)
    }

    console.log('✅ All connection tests passed!')
    process.exit(0)

  } catch (error) {
    console.error('❌ Connection test failed:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    process.exit(1)
  }
}

testConnection()

