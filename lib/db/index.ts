import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { getPostgresConfig } from './connection-config'

let _db: ReturnType<typeof drizzle> | null = null
let _client: ReturnType<typeof postgres> | null = null

function getDb() {
  // Only check DATABASE_URL when we actually need to use the database
  // This allows the module to be imported during build without throwing
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  // Initialize client and db lazily
  if (!_client || !_db) {
    _client = postgres(process.env.DATABASE_URL, getPostgresConfig(process.env.DATABASE_URL))
    _db = drizzle(_client, { schema })
  }

  return _db
}

// Create a Proxy that lazily initializes the database on first access
// This allows the module to be imported during build without connecting to the database
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, _receiver) {
    const dbInstance = getDb()
    const value = dbInstance[prop as keyof typeof dbInstance]
    // If it's a function, bind it to the db instance
    if (typeof value === 'function') {
      return value.bind(dbInstance)
    }
    return value
  },
})

