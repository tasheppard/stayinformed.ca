#!/usr/bin/env tsx
/**
 * Run database migrations on production database
 * Uses .env.production for DATABASE_URL
 * 
 * WARNING: This will modify the production database!
 * Make sure you have a backup before running.
 */

import * as dotenv from 'dotenv'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Load production environment variables
dotenv.config({ path: '.env.production' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set in .env.production')
  console.error('Please ensure .env.production contains DATABASE_URL')
  process.exit(1)
}

// Verify this is actually production
const dbUrl = process.env.DATABASE_URL || ''
const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')

if (isLocalhost) {
  console.warn('⚠️  WARNING: DATABASE_URL appears to be localhost')
  console.warn('   This script is for PRODUCTION migrations only!')
  console.warn('   If you want to migrate local database, use: npm run db:migrate')
  console.log('')
  console.log('⚠️  To proceed with production migration, ensure:')
  console.log('   1. You have a backup of the production database')
  console.log('   2. The .env.production file contains the correct DATABASE_URL')
  console.log('   3. You understand this will modify the production database')
  console.log('')
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

const encodedUrl = encodeDatabaseUrl(process.env.DATABASE_URL)
const client = postgres(encodedUrl)
const db = drizzle(client)

async function runProductionMigrations() {
  console.log('🚀 Running migrations on PRODUCTION database...')
  console.log('')
  
  try {
    // Show database info (masked)
    const maskedUrl = dbUrl.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2')
    console.log(`📊 Database: ${maskedUrl.split('@')[1] || 'production'}`)
    console.log('')

    await migrate(db, { migrationsFolder: './lib/db/migrations' })
    
    console.log('')
    console.log('✅ Production migrations completed successfully!')
    console.log('')
    
    await client.end()
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('❌ Production migration failed:', error)
    console.error('')
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    await client.end()
    process.exit(1)
  }
}

runProductionMigrations()

