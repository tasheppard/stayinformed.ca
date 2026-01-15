import { run, Runner } from 'graphile-worker'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

/**
 * Determine the timezone offset for Eastern Time (Canada/US) based on DST
 * 
 * DST rules for Eastern Time:
 * - DST starts: Second Sunday in March at 2:00 AM local time
 * - DST ends: First Sunday in November at 2:00 AM local time
 * - During DST: EDT (UTC-4)
 * - During standard time: EST (UTC-5)
 * 
 * @param date The date to check (defaults to current date)
 * @returns The timezone offset in hours (-4 for EDT, -5 for EST)
 */
export function getEasternTimeOffset(date: Date = new Date()): number {
  // Check if timezone offset is explicitly configured
  const configuredOffset = process.env.TIMEZONE_OFFSET
  if (configuredOffset) {
    const offset = parseInt(configuredOffset, 10)
    if (!isNaN(offset)) {
      return offset
    }
  }

  const year = date.getUTCFullYear()
  
  // Find second Sunday in March (DST start)
  // DST starts at 2:00 AM local time on the second Sunday in March
  // March 1st is the starting point
  const march1 = new Date(Date.UTC(year, 2, 1)) // March 1
  const march1Day = march1.getUTCDay() // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days to first Sunday in March
  // If March 1 is Sunday (0), first Sunday is March 1 (0 days)
  // If March 1 is Monday (1), first Sunday is March 7 (6 days)
  // Formula: (7 - march1Day) % 7
  const daysToFirstSunday = (7 - march1Day) % 7
  // Second Sunday is 7 days after first Sunday
  const daysToSecondSunday = daysToFirstSunday + 7
  // DST starts at 2:00 AM local time
  // At that moment, we're still in EST (UTC-5), so 2:00 AM EST = 7:00 AM UTC
  const dstStart = new Date(Date.UTC(year, 2, 1 + daysToSecondSunday, 7, 0, 0, 0))
  
  // Find first Sunday in November (DST end)
  // DST ends at 2:00 AM local time on the first Sunday in November
  const november1 = new Date(Date.UTC(year, 10, 1)) // November 1
  const november1Day = november1.getUTCDay()
  // Calculate days to first Sunday in November
  const daysToFirstSundayNov = (7 - november1Day) % 7
  // DST ends at 2:00 AM local time
  // At that moment, we're still in EDT (UTC-4), so 2:00 AM EDT = 6:00 AM UTC
  const dstEnd = new Date(Date.UTC(year, 10, 1 + daysToFirstSundayNov, 6, 0, 0, 0))
  
  // Check if date is during DST period
  // DST is in effect from second Sunday in March to first Sunday in November
  if (date >= dstStart && date < dstEnd) {
    return -4 // EDT (UTC-4)
  }
  
  return -5 // EST (UTC-5)
}

/**
 * Calculate next Friday at specified time (Eastern Time)
 * Used for weekly jobs that run on Fridays
 * 
 * @param hour Hour in 24-hour format (0-23)
 * @param minute Minute (0-59)
 * @param timezoneOffset Optional timezone offset (defaults to Eastern Time)
 * @returns Date object representing next Friday at the specified time in UTC
 */
function getNextFriday(hour: number, minute: number, timezoneOffset?: number): Date {
  const now = new Date()
  const offset = timezoneOffset ?? getEasternTimeOffset()
  
  // Get UTC date components
  const utcYear = now.getUTCFullYear()
  const utcMonth = now.getUTCMonth()
  const utcDay = now.getUTCDate()
  const utcHour = now.getUTCHours()
  const utcMinute = now.getUTCMinutes()
  
  // Convert to Eastern Time by adjusting the hour
  // Offset is negative (EST = -5, EDT = -4), so we add it to get Eastern Time
  let easternHour = utcHour + offset
  let easternDay = utcDay
  let easternMonth = utcMonth
  let easternYear = utcYear
  
  // Handle day rollover when adjusting for timezone
  if (easternHour < 0) {
    easternHour += 24
    easternDay--
    if (easternDay < 1) {
      easternMonth--
      if (easternMonth < 0) {
        easternMonth = 11
        easternYear--
      }
      // Get days in previous month
      const daysInPrevMonth = new Date(Date.UTC(easternYear, easternMonth + 1, 0)).getUTCDate()
      easternDay = daysInPrevMonth
    }
  } else if (easternHour >= 24) {
    easternHour -= 24
    easternDay++
    const daysInMonth = new Date(Date.UTC(easternYear, easternMonth + 1, 0)).getUTCDate()
    if (easternDay > daysInMonth) {
      easternDay = 1
      easternMonth++
      if (easternMonth > 11) {
        easternMonth = 0
        easternYear++
      }
    }
  }
  
  // Get day of week for Eastern Time date
  // Create a UTC date representing the Eastern Time date at noon (to avoid DST edge cases)
  const easternDate = new Date(Date.UTC(easternYear, easternMonth, easternDay, 12, 0, 0, 0))
  const currentDay = easternDate.getUTCDay()
  
  // Calculate days until next Friday
  let daysUntilFriday: number
  if (currentDay === 5) {
    // Today is Friday - check if scheduled time has passed
    const scheduledTime = hour * 60 + minute
    const currentTime = easternHour * 60 + utcMinute
    
    if (currentTime < scheduledTime) {
      // Scheduled time hasn't passed today - use today
      daysUntilFriday = 0
    } else {
      // Scheduled time has passed - use next Friday (7 days)
      daysUntilFriday = 7
    }
  } else if (currentDay < 5) {
    // Before Friday - days until Friday
    daysUntilFriday = 5 - currentDay
  } else {
    // After Friday (Saturday) - days until next Friday
    daysUntilFriday = 7 - (currentDay - 5)
  }
  
  // Calculate target date in Eastern Time
  const targetEasternDate = new Date(Date.UTC(easternYear, easternMonth, easternDay, 12, 0, 0, 0))
  targetEasternDate.setUTCDate(targetEasternDate.getUTCDate() + daysUntilFriday)
  
  const targetYear = targetEasternDate.getUTCFullYear()
  const targetMonth = targetEasternDate.getUTCMonth()
  const targetDay = targetEasternDate.getUTCDate()
  
  // Get offset for target date (in case DST changes)
  const targetDate = new Date(Date.UTC(targetYear, targetMonth, targetDay, 12, 0, 0, 0))
  const targetOffset = timezoneOffset ?? getEasternTimeOffset(targetDate)
  
  // Create scheduled time in Eastern Time
  const targetLocalMidnight = new Date(Date.UTC(targetYear, targetMonth, targetDay, 0, 0, 0, 0))
  const targetLocalScheduled = new Date(
    targetLocalMidnight.getTime() + (hour * 60 * 60 * 1000) + (minute * 60 * 1000)
  )
  
  // Convert Eastern Time to UTC
  const targetUtc = new Date(targetLocalScheduled.getTime() - (targetOffset * 60 * 60 * 1000))
  
  return targetUtc
}

/**
 * Calculate next run time based on cron-like schedule
 * Simple implementation: expects format "HH MM" (24-hour format)
 * Example: "01 00" = 1:00 AM, "02 00" = 2:00 AM
 * 
 * Automatically handles DST for Eastern Time (EST/EDT)
 */
function getNextRunTime(schedule: string, timezoneOffset?: number): Date {
  // Use provided offset or determine dynamically based on DST
  const offset = timezoneOffset ?? getEasternTimeOffset()
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

  // Work with local time first, then convert to UTC
  // This avoids date adjustment issues when local date differs from UTC date
  const now = new Date()
  
  // Step 1: Get current local time (for the target timezone)
  // offset is in hours: negative for behind UTC (EST = -5, EDT = -4), positive for ahead
  // To get local time from UTC, add the offset (local is behind UTC, so we add)
  const nowLocalMs = now.getTime() + (offset * 60 * 60 * 1000)
  const nowLocal = new Date(nowLocalMs)
  
  // Step 2: Extract local date components (year, month, day)
  const localYear = nowLocal.getUTCFullYear()
  const localMonth = nowLocal.getUTCMonth()
  const localDay = nowLocal.getUTCDate()
  
  // Step 3: Create a date representing the scheduled time in local timezone
  // We'll create it as if it were UTC, then adjust
  // Create midnight of the local date in "local timezone" (represented as UTC)
  const localMidnight = new Date(Date.UTC(localYear, localMonth, localDay, 0, 0, 0, 0))
  // Add the scheduled hours/minutes in local time
  const localScheduled = new Date(localMidnight.getTime() + (hour * 60 * 60 * 1000) + (minute * 60 * 1000))
  
  // Step 4: Convert local scheduled time to UTC
  // To convert local to UTC, subtract the offset (UTC is ahead of local)
  // Note: We need to use the offset for the target date, not necessarily today
  // For simplicity, we'll use today's offset and recalculate if needed for tomorrow
  const todayUtc = new Date(localScheduled.getTime() - (offset * 60 * 60 * 1000))
  
  // Step 5: Check if this time has already passed (compare in local time)
  // Convert todayUtc back to local time for comparison
  const todayLocalMs = todayUtc.getTime() + (offset * 60 * 60 * 1000)
  
  if (todayLocalMs <= nowLocalMs) {
    // Schedule for tomorrow in local time
    const tomorrowLocal = new Date(nowLocalMs + (24 * 60 * 60 * 1000))
    const tomorrowYear = tomorrowLocal.getUTCFullYear()
    const tomorrowMonth = tomorrowLocal.getUTCMonth()
    const tomorrowDay = tomorrowLocal.getUTCDate()
    
    // Get offset for tomorrow (in case DST changes overnight)
    const tomorrowDate = new Date(Date.UTC(tomorrowYear, tomorrowMonth, tomorrowDay, 12, 0, 0, 0))
    const tomorrowOffset = timezoneOffset ?? getEasternTimeOffset(tomorrowDate)
    
    // Create midnight of tomorrow's local date
    const tomorrowLocalMidnight = new Date(Date.UTC(tomorrowYear, tomorrowMonth, tomorrowDay, 0, 0, 0, 0))
    // Add the scheduled hours/minutes in local time
    const tomorrowLocalScheduled = new Date(tomorrowLocalMidnight.getTime() + (hour * 60 * 60 * 1000) + (minute * 60 * 1000))
    // Convert to UTC using tomorrow's offset
    const nextRun = new Date(tomorrowLocalScheduled.getTime() - (tomorrowOffset * 60 * 60 * 1000))
    return nextRun
  }
  
  return todayUtc
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
    // Default schedules (1 AM, 2 AM, and 3 AM Eastern Time)
    // Format: "HH MM" (24-hour format)
    // Automatically handles DST: EST (UTC-5) or EDT (UTC-4)
    // Score recalculation runs at 3 AM to ensure it executes after data scrapers complete
    const mpListSchedule = process.env.MP_LIST_SCRAPER_SCHEDULE || '01 00' // 1 AM Eastern Time
    const mpDetailsSchedule = process.env.MP_DETAIL_SCRAPER_SCHEDULE || '02 00' // 2 AM Eastern Time
    const scoresSchedule = process.env.SCORES_RECALCULATION_SCHEDULE || '03 00' // 3 AM Eastern Time (after scrapers complete)

    // Calculate next run times (automatically handles EST/EDT based on DST)
    // getNextRunTime will determine the correct offset based on the current date
    const mpListNextRun = getNextRunTime(mpListSchedule)
    const mpDetailsNextRun = getNextRunTime(mpDetailsSchedule)
    const scoresNextRun = getNextRunTime(scoresSchedule)

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

    // Determine timezone label for display
    const currentOffset = getEasternTimeOffset()
    const timezoneLabel = currentOffset === -4 ? 'EDT' : 'EST'
    
    console.log(`✅ Scheduled scrapeMPList job (key: scrape-mp-list-daily)`)
    console.log(`   Next run: ${mpListNextRun.toISOString()} (${mpListSchedule} ${timezoneLabel})`)

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
    console.log(`   Next run: ${mpDetailsNextRun.toISOString()} (${mpDetailsSchedule} ${timezoneLabel})`)

    // Schedule score recalculation job
    await runner.addJob(
      'recalculateScores',
      {},
      {
        jobKey: 'recalculate-scores-daily',
        jobKeyMode: 'replace',
        runAt: scoresNextRun,
      }
    )

    console.log(`✅ Scheduled recalculateScores job (key: recalculate-scores-daily)`)
    console.log(`   Next run: ${scoresNextRun.toISOString()} (${scoresSchedule} ${timezoneLabel})`)

    // Schedule weekly digest job (Fridays @ 9 AM EST)
    const weeklyDigestSchedule = process.env.WEEKLY_DIGEST_SCHEDULE || '09 00' // 9 AM Eastern Time
    const weeklyDigestParts = weeklyDigestSchedule.trim().split(/\s+/)
    if (weeklyDigestParts.length < 2) {
      throw new Error(`Invalid weekly digest schedule format: ${weeklyDigestSchedule}. Expected "HH MM" (24-hour format)`)
    }
    const weeklyDigestHour = parseInt(weeklyDigestParts[0], 10)
    const weeklyDigestMinute = parseInt(weeklyDigestParts[1], 10)
    
    if (isNaN(weeklyDigestHour) || weeklyDigestHour < 0 || weeklyDigestHour > 23) {
      throw new Error(`Invalid hour in weekly digest schedule: ${weeklyDigestHour}`)
    }
    if (isNaN(weeklyDigestMinute) || weeklyDigestMinute < 0 || weeklyDigestMinute > 59) {
      throw new Error(`Invalid minute in weekly digest schedule: ${weeklyDigestMinute}`)
    }

    const weeklyDigestNextRun = getNextFriday(weeklyDigestHour, weeklyDigestMinute)

    await runner.addJob(
      'sendWeeklyDigests',
      {},
      {
        jobKey: 'send-weekly-digests-weekly',
        jobKeyMode: 'replace',
        runAt: weeklyDigestNextRun,
      }
    )

    console.log(`✅ Scheduled sendWeeklyDigests job (key: send-weekly-digests-weekly)`)
    console.log(`   Next run: ${weeklyDigestNextRun.toISOString()} (Fridays at ${weeklyDigestSchedule} ${timezoneLabel})`)
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
