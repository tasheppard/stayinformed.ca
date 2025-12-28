import postgres from 'postgres'

/**
 * Detects if the DATABASE_URL is pointing to a local Supabase instance
 * Local Supabase typically uses localhost:54322 for direct connections
 */
export function isLocalDatabase(url: string): boolean {
  return url.includes('localhost:54322') || url.includes('127.0.0.1:54322')
}

/**
 * Gets the appropriate SSL configuration based on environment
 * Production Supabase requires SSL, local does not
 */
export function getSslConfig(url: string) {
  return isLocalDatabase(url) ? false : 'require'
}

/**
 * Gets the postgres client configuration for Supabase compatibility
 * This configuration supports both local (development) and production Supabase instances
 */
export function getPostgresConfig(url: string): postgres.Options<{}> {
  return {
    ssl: getSslConfig(url),
    prepare: false, // Required for Supabase Transaction Pooler (port 6543)
    max: 10, // Maximum number of connections in the pool
    idle_timeout: 20, // Close idle connections after 20 seconds
    connect_timeout: 10, // Connection timeout in seconds
  }
}

