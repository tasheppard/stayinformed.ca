#!/usr/bin/env tsx
/**
 * Script to scrape MP list from ourcommons.ca XML endpoint
 * 
 * Usage:
 *   tsx scripts/scrape-mp-list.ts
 * 
 * Environment variables:
 *   MP_SCRAPER_DRY_RUN=true  - Only process first 5 MPs (for testing)
 *   DATABASE_URL             - Database connection string (required)
 */

import * as dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
// This ensures DATABASE_URL is available when db/index.ts is imported
dotenv.config({ path: '.env.local' })
// Also try loading from .env if .env.local doesn't have DATABASE_URL
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' })
}
// Fallback to .env.development or .env.production based on NODE_ENV
if (!process.env.DATABASE_URL) {
  const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
  dotenv.config({ path: envFile })
}

async function scrapeMPList() {
  // Dynamic import after env vars are loaded
  const { MPListScraper } = await import('../lib/scrapers/mp-list-scraper.js')
  
  console.log('🔄 Starting MP list scraper...\n')

  const isDryRun = process.env.MP_SCRAPER_DRY_RUN === 'true'
  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE: Only processing first 5 MPs\n')
  }

  try {
    const scraper = new MPListScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: false, // XML scraping doesn't need Playwright
    })

    const result = await scraper.run()

    if (result.success && result.data) {
      console.log(`\n✅ MP list scraper completed successfully!`)
      console.log(`   📊 Processed ${result.data.length} MPs`)
      console.log(`   🔗 Source: ${result.sourceUrl || 'N/A'}\n`)
      process.exit(0)
    } else {
      console.error(`\n❌ MP list scraper failed: ${result.error || 'Unknown error'}\n`)
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ MP list scraper error:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    process.exit(1)
  }
}

scrapeMPList().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

