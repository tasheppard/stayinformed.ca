import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getPostgresConfig } from './connection-config'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set')
  console.error('Please ensure .env.local contains DATABASE_URL')
  process.exit(1)
}

const client = postgres(process.env.DATABASE_URL, getPostgresConfig(process.env.DATABASE_URL))
const db = drizzle(client)

async function runMigrations() {
  console.log('Running migrations...')
  try {
    await migrate(db, { migrationsFolder: './lib/db/migrations' })
    console.log('✅ Migrations completed successfully')
    await client.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    await client.end()
    process.exit(1)
  }
}

runMigrations()

