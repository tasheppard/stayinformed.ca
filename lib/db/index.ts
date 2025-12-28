import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { getPostgresConfig } from './connection-config'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Configure postgres client with Supabase-compatible settings
const client = postgres(process.env.DATABASE_URL, getPostgresConfig(process.env.DATABASE_URL))

export const db = drizzle(client, { schema })

