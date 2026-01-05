#!/usr/bin/env tsx
/**
 * Quick script to view MPs in the database
 */

import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' })
}
if (!process.env.DATABASE_URL) {
  const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
  dotenv.config({ path: envFile })
}

async function viewMPs() {
  const { db } = await import('../lib/db/index.js')
  const { mps } = await import('../lib/db/schema.js')

  try {
    console.log('📊 Fetching MPs from database...\n')

    const allMPs = await db.select().from(mps).orderBy(mps.id).limit(20)

    if (allMPs.length === 0) {
      console.log('❌ No MPs found in database.\n')
      process.exit(0)
    }

    console.log(`✅ Found ${allMPs.length} MP(s):\n`)
    console.log('─'.repeat(100))

    allMPs.forEach((mp) => {
      console.log(`\n🆔 ID: ${mp.id}`)
      console.log(`   👤 Name: ${mp.fullName}`)
      console.log(`   🆔 Person ID: ${mp.personId || '(not set)'}`)
      console.log(`   📍 Riding: ${mp.constituencyName}`)
      console.log(`   🗺️  Province: ${mp.province}`)
      console.log(`   🏛️  Caucus: ${mp.caucusShortName || '(not set)'}`)
      console.log(`   ✅ Active: ${mp.isActive ? 'Yes' : 'No'}`)
      console.log(`   📊 Status: ${mp.status}`)
      console.log(`   🔗 Slug: ${mp.slug}`)
      console.log(`   📅 Created: ${mp.createdAt}`)
      console.log(`   🔄 Updated: ${mp.updatedAt}`)
    })

    console.log('\n' + '─'.repeat(100))
    
    // Get statistics using efficient COUNT queries
    const { sql } = await import('drizzle-orm')
    const statsResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false) as inactive
      FROM mps
    `)
    
    const stats = statsResult[0] as { total: string; active: string; inactive: string }
    console.log(`\n📈 Total MPs in database: ${stats.total}`)
    console.log(`📈 Active MPs: ${stats.active}`)
    console.log(`📈 Inactive MPs: ${stats.inactive}\n`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error fetching MPs:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
    }
    process.exit(1)
  }
}

viewMPs().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

