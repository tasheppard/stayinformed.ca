#!/usr/bin/env tsx
/**
 * Verifies that DATABASE_URL format matches expected Supabase patterns
 */

import * as dotenv from 'dotenv'

// Load environment variables - check for production first, then local
const envFile = process.env.ENV_FILE || (process.argv.includes('--production') ? '.env.production' : '.env.local')
dotenv.config({ path: envFile })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is not set')
  process.exit(1)
}

console.log('🔍 Verifying DATABASE_URL format...\n')
console.log('DATABASE_URL:', databaseUrl.replace(/:([^:@]+)@/, ':****@')) // Hide password
console.log('')

// Check for local Supabase pattern (localhost:54322)
const isLocal = databaseUrl.includes('localhost:54322') || databaseUrl.includes('127.0.0.1:54322')

// Check for production Supabase Transaction Pooler pattern (port 6543)
const isTransactionPooler = databaseUrl.includes(':6543') || databaseUrl.includes('pgbouncer=true')

// Check for production Supabase Direct Connection pattern (port 5432, db. prefix)
const isDirectConnection = databaseUrl.includes('db.') && databaseUrl.includes('.supabase.co:5432')

// Check for production Supabase pattern (supabase.co)
const isProduction = databaseUrl.includes('.supabase.co')

// Validate format
let isValid = false
let connectionType = ''

if (isLocal) {
  isValid = true
  connectionType = 'Local Supabase (Development)'
  console.log('✅ Detected:', connectionType)
  console.log('   Expected: localhost:54322')
  console.log('   SSL: false (auto-detected)')
} else if (isTransactionPooler) {
  isValid = true
  connectionType = 'Production Supabase (Transaction Pooler)'
  console.log('✅ Detected:', connectionType)
  console.log('   Expected: port 6543 or pgbouncer=true parameter')
  console.log('   SSL: require (auto-detected)')
  console.log('   prepare: false (required)')
} else if (isDirectConnection) {
  isValid = true
  connectionType = 'Production Supabase (Direct Connection)'
  console.log('✅ Detected:', connectionType)
  console.log('   Expected: db.*.supabase.co:5432')
  console.log('   SSL: require (auto-detected)')
} else if (isProduction) {
  isValid = true
  connectionType = 'Production Supabase (Unknown type)'
  console.log('⚠️  Detected:', connectionType)
  console.log('   Pattern matches supabase.co but port/type unclear')
  console.log('   SSL: require (auto-detected)')
} else {
  isValid = false
  connectionType = 'Unknown'
  console.log('❌ Unknown DATABASE_URL format')
  console.log('   Expected patterns:')
  console.log('   - Local: postgresql://postgres:password@localhost:54322/postgres')
  console.log('   - Transaction Pooler: postgresql://postgres:password@*.supabase.co:6543/postgres?pgbouncer=true')
  console.log('   - Direct: postgresql://postgres:password@db.*.supabase.co:5432/postgres')
}

console.log('')

// Test the connection config helper
try {
  const { isLocalDatabase, getSslConfig } = await import('../lib/db/connection-config.js')
  const detectedLocal = isLocalDatabase(databaseUrl)
  const sslConfig = getSslConfig(databaseUrl)
  
  console.log('📊 Connection Configuration Detection:')
  console.log('   isLocalDatabase():', detectedLocal)
  console.log('   getSslConfig():', sslConfig)
  console.log('')
  
  if (detectedLocal === isLocal) {
    console.log('✅ Connection config detection matches URL pattern')
  } else {
    console.log('⚠️  Connection config detection differs from URL pattern')
  }
} catch (error) {
  console.error('❌ Error testing connection config:', error)
}

if (isValid) {
  console.log('✅ DATABASE_URL format is valid for Supabase')
  process.exit(0)
} else {
  console.log('❌ DATABASE_URL format does not match expected Supabase patterns')
  process.exit(1)
}

