import { run, Runner } from 'graphile-worker'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

/**
 * Calculate next run time based on cron-like schedule
 * Simple implementation: expects format "HH MM" (24-hour format)
 * Example: "01 00" = 1:00 AM, "02 00" = 2:00 AM
 * 
 * For EST: 1 AM EST = 6 AM UTC, 2 AM EST = 7 AM UTC
 */
function getNextRunTime(schedule: string, timezoneOffset: number = -5): Date {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length < 2) {
    throw new Error(`Invalid schedule format: ${schedule}. Expected "HH MM" (24-hour format)`)
  }

  const hour = parseInt(parts[0], 10)
  const minute = parseInt(parts[1], 10)

  if (isNaN(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid hour in schedule: ${hour}`)
  }
  if (isNaN(minute) || minute < 0 || minute > 59) {
    throw new Error(`Invalid minute in schedule: ${minute}`)
  }

  // Convert local time to UTC
  // timezoneOffset: negative for timezones behind UTC (e.g., EST = -5), positive for ahead
  let utcHour = hour - timezoneOffset
  const utcMinute = minute

  // Normalize hour to 0-23 range and adjust date accordingly
  let dateAdjustment = 0
  if (utcHour >= 24) {
    // Hour overflow: move to next day(s)
    // Example: 25 hours = 1 AM next day
    dateAdjustment = Math.floor(utcHour / 24)
    utcHour = utcHour % 24
  } else if (utcHour < 0) {
    // Hour underflow: move to previous day(s)
    // Example: -4 hours = 8 PM previous day (20:00)
    // Math.floor for negative numbers gives us the correct day adjustment
    dateAdjustment = Math.floor(utcHour / 24)
    // Convert to positive hour: subtract the day adjustment (which is negative)
    utcHour = utcHour - (dateAdjustment * 24)
  }

  const now = new Date()
  const nextRun = new Date()
  
  // Set UTC time with normalized hour
  nextRun.setUTCHours(utcHour, utcMinute, 0, 0)
  
  // Apply date adjustment from hour overflow/underflow
  if (dateAdjustment !== 0) {
    nextRun.setUTCDate(nextRun.getUTCDate() + dateAdjustment)
  }

  // If the time has already passed today, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1)
  }

  return nextRun
}

/**
 * Schedule MP scraper jobs using Graphile Worker
 * 
 * Jobs:
 * - scrapeMPList: Daily at 1 AM EST (configurable via MP_LIST_SCRAPER_SCHEDULE)
 * - scrapeMPDetails: Daily at 2 AM EST (configurable via MP_DETAIL_SCRAPER_SCHEDULE)
 * 
 * Job keys ensure idempotency (only one scheduled job per key)
 * 
 * Note: This function should be called by an external scheduler (cron, Railway cron, etc.)
 * or run periodically to schedule the next occurrence of each job.
 */
export async function scheduleJobs(): Promise<void> {
  console.log('Setting up Graphile Worker job scheduling...')

  // Create a runner instance for scheduling jobs
  // We'll use a minimal runner just for scheduling, not for executing tasks
  const runner = await run({
    connectionString: process.env.DATABASE_URL!,
    concurrency: 1,
    noHandleSignals: true,
    pollInterval: 1000,
    taskList: {}, // Empty task list - we're only scheduling, not executing
  })

  try {
    // Default schedules (1 AM and 2 AM EST)
    // Format: "HH MM" (24-hour format)
    // EST is UTC-5, so we'll convert in getNextRunTime
    const mpListSchedule = process.env.MP_LIST_SCRAPER_SCHEDULE || '01 00' // 1 AM EST
    const mpDetailsSchedule = process.env.MP_DETAIL_SCRAPER_SCHEDULE || '02 00' // 2 AM EST

    // Calculate next run times (EST timezone, UTC-5)
    const mpListNextRun = getNextRunTime(mpListSchedule, -5)
    const mpDetailsNextRun = getNextRunTime(mpDetailsSchedule, -5)

    // Schedule scrapeMPList job
    // Job key ensures idempotency - only one job will be scheduled per key
    await runner.addJob(
      'scrape-mp-list',
      {},
      {
        jobKey: 'scrape-mp-list-daily',
        jobKeyMode: 'replace', // Replace existing job with same key
        runAt: mpListNextRun,
      }
    )

    console.log(`✅ Scheduled scrapeMPList job (key: scrape-mp-list-daily)`)
    console.log(`   Next run: ${mpListNextRun.toISOString()} (${mpListSchedule} EST)`)

    // Schedule scrapeMPDetails job
    // This should run after scrapeMPList completes
    // We schedule it for 2 AM EST (1 hour after MP list)
    await runner.addJob(
      'scrape-mp-details',
      {},
      {
        jobKey: 'scrape-mp-details-daily',
        jobKeyMode: 'replace',
        runAt: mpDetailsNextRun,
      }
    )

    console.log(`✅ Scheduled scrapeMPDetails job (key: scrape-mp-details-daily)`)
    console.log(`   Next run: ${mpDetailsNextRun.toISOString()} (${mpDetailsSchedule} EST)`)
    console.log('')
    console.log('ℹ️  Note: For production, this script should be called by:')
    console.log('   - System cron (daily)')
    console.log('   - Railway cron job')
    console.log('   - Or another scheduler service')
    console.log('   This ensures jobs are rescheduled after each run.')

    // Stop the runner after scheduling
    await runner.stop()
    
    console.log('✅ Job scheduling complete')
  } catch (error) {
    console.error('❌ Failed to schedule jobs:', error)
    await runner.stop()
    throw error
  }
}

// Run scheduling if called directly
if (require.main === module) {
  scheduleJobs()
    .then(() => {
      console.log('Scheduling complete')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Scheduling failed:', error)
      process.exit(1)
    })
}

