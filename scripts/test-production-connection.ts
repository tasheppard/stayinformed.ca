#!/usr/bin/env tsx
/**
 * Test production database connection
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.production' })

async function testConnection() {
  const url = process.env.DATABASE_URL || ''
  
  console.log('🔍 Testing production database connection...\n')
  console.log(`URL format: ${url.substring(0, 50)}...`)
  console.log(`Hostname: ${url.match(/@([^:]+)/)?.[1] || 'not found'}\n`)
  
  // Try different URL formats
  const formats = [
    { name: 'Original', url },
    { name: 'With port 6543 (pooler)', url.replace(':5432', ':6543') },
    { name: 'Direct connection', url.replace('/postgres', '') },
  ]
  
  for (const format of formats) {
    console.log(`Testing ${format.name}...`)
    try {
      const postgres = (await import('postgres')).default
      
      // URL-encode password
      function encodeDatabaseUrl(url: string): string {
        const match = url.match(/^(postgresql?:\/\/[^:]+):([^@]+)@(.+)$/)
        if (match) {
          const [, userPart, password, rest] = match
          const encodedPassword = encodeURIComponent(password)
          return `${userPart}:${encodedPassword}@${rest}`
        }
        return url
      }
      
      const encodedUrl = encodeDatabaseUrl(format.url)
      const client = postgres(encodedUrl, { max: 1 })
      
      const result = await client`SELECT version() as version, current_database() as database`
      console.log(`   ✅ Success! Database: ${result[0].database}`)
      await client.end()
      console.log(`\n✅ Working format: ${format.name}`)
      console.log(`   Use this in .env.production:\n   DATABASE_URL="${format.url}"\n`)
      return
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message?.substring(0, 60)}...`)
    }
  }
  
  console.log('\n❌ All connection attempts failed')
  console.log('\n💡 Try checking:')
  console.log('   1. Supabase project is active (not paused)')
  console.log('   2. IP address is allowed in Supabase settings')
  console.log('   3. Use connection pooler URL from Supabase dashboard')
}

testConnection().catch(console.error)

