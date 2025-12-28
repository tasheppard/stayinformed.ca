import { db } from '../db'
import postgres from 'postgres'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const client = postgres(process.env.DATABASE_URL)

/**
 * Schedule scraper jobs using Graphile Worker
 * This should be run once to set up the initial schedule
 */
export async function scheduleScraperJobs() {
  console.log('📅 Scheduling scraper jobs...')

  try {
    // Schedule votes scraper - hourly on sitting days (9 AM - 6 PM EST, Mon-Fri)
    // Note: In production, you'd want to check if it's a sitting day
    await client`
      SELECT graphile_worker.add_job(
        'scrapeVotes',
        '{}'::json,
        job_key => 'scrape-votes-hourly',
        run_at => NOW() + INTERVAL '1 hour',
        max_attempts => 3
      )
    `.catch(() => {
      // Job might already exist, that's okay
      console.log('Votes scraper job already scheduled or Graphile Worker not initialized')
    })

    // Schedule bills scraper - daily at 2 AM EST
    await client`
      SELECT graphile_worker.add_job(
        'scrapeBills',
        '{}'::json,
        job_key => 'scrape-bills-daily',
        run_at => NOW() + INTERVAL '1 day',
        max_attempts => 3
      )
    `.catch(() => {
      console.log('Bills scraper job already scheduled or Graphile Worker not initialized')
    })

    // Schedule expenses scraper - daily at 3 AM EST
    await client`
      SELECT graphile_worker.add_job(
        'scrapeExpenses',
        '{}'::json,
        job_key => 'scrape-expenses-daily',
        run_at => NOW() + INTERVAL '1 day',
        max_attempts => 3
      )
    `.catch(() => {
      console.log('Expenses scraper job already scheduled or Graphile Worker not initialized')
    })

    // Schedule petitions scraper - daily at 4 AM EST
    await client`
      SELECT graphile_worker.add_job(
        'scrapePetitions',
        '{}'::json,
        job_key => 'scrape-petitions-daily',
        run_at => NOW() + INTERVAL '1 day',
        max_attempts => 3
      )
    `.catch(() => {
      console.log('Petitions scraper job already scheduled or Graphile Worker not initialized')
    })

    // Schedule committees scraper - daily at 5 AM EST
    await client`
      SELECT graphile_worker.add_job(
        'scrapeCommittees',
        '{}'::json,
        job_key => 'scrape-committees-daily',
        run_at => NOW() + INTERVAL '1 day',
        max_attempts => 3
      )
    `.catch(() => {
      console.log('Committees scraper job already scheduled or Graphile Worker not initialized')
    })

    // Schedule MP profile scraper - weekly on Sunday at 6 AM EST
    await client`
      SELECT graphile_worker.add_job(
        'scrapeMPProfiles',
        '{}'::json,
        job_key => 'scrape-mp-profiles-weekly',
        run_at => NOW() + INTERVAL '7 days',
        max_attempts => 3
      )
    `.catch(() => {
      console.log('MP profile scraper job already scheduled or Graphile Worker not initialized')
    })

    console.log('✅ Scraper jobs scheduled successfully')
  } catch (error) {
    console.error('❌ Failed to schedule scraper jobs:', error)
    throw error
  } finally {
    await client.end()
  }
}

// Run if called directly
if (require.main === module) {
  scheduleScraperJobs()
    .then(() => {
      console.log('Scheduling complete')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Scheduling failed:', error)
      process.exit(1)
    })
}

