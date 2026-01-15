import { JobHelpers } from 'graphile-worker'
import { generateAllWeeklyDigests } from '../lib/email/weekly-digest'
import { resend, EMAIL_CONFIG } from '../lib/email/resend-client'
import { getEasternTimeOffset } from '../lib/workers/schedule-jobs'
import { db } from '../lib/db'
import { weeklyDigestSent } from '../lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * Calculate next Friday at specified time (Eastern Time)
 * Used for weekly jobs that run on Fridays
 * 
 * This function uses the proper DST calculation from schedule-jobs.ts
 * to correctly handle DST transitions (second Sunday in March to first Sunday in November)
 * 
 * @param hour Hour in 24-hour format (0-23)
 * @param minute Minute (0-59)
 * @returns Date object representing next Friday at the specified time in UTC
 */
function getNextFriday(hour: number, minute: number): Date {
  const now = new Date()
  const offset = getEasternTimeOffset()
  
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
  const targetOffset = getEasternTimeOffset(targetDate)
  
  // Create scheduled time in Eastern Time
  const targetLocalMidnight = new Date(Date.UTC(targetYear, targetMonth, targetDay, 0, 0, 0, 0))
  const targetLocalScheduled = new Date(
    targetLocalMidnight.getTime() + (hour * 60 * 60 * 1000) + (minute * 60 * 1000)
  )
  
  // Convert Eastern Time to UTC
  const targetUtc = new Date(targetLocalScheduled.getTime() - (targetOffset * 60 * 60 * 1000))
  
  return targetUtc
}

// Lazy load Sentry to avoid initialization issues
let Sentry: typeof import('@sentry/node') | null = null

async function getSentry() {
  if (!Sentry && process.env.SENTRY_DSN) {
    Sentry = await import('@sentry/node')
  }
  return Sentry
}

/**
 * Generate week identifier in format YYYY-WW (e.g., "2025-01")
 * Uses ISO week numbering
 */
function getWeekIdentifier(date: Date = new Date()): string {
  // Get the date in Eastern Time for consistent week calculation
  const offset = getEasternTimeOffset(date)
  const utcYear = date.getUTCFullYear()
  const utcMonth = date.getUTCMonth()
  const utcDay = date.getUTCDate()
  const utcHour = date.getUTCHours()
  
  // Convert to Eastern Time
  let easternHour = utcHour + offset
  let easternDay = utcDay
  let easternMonth = utcMonth
  let easternYear = utcYear
  
  // Handle day rollover
  if (easternHour < 0) {
    easternHour += 24
    easternDay--
    if (easternDay < 1) {
      easternMonth--
      if (easternMonth < 0) {
        easternMonth = 11
        easternYear--
      }
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
  
  // Create date in Eastern Time for ISO week calculation
  const easternDate = new Date(Date.UTC(easternYear, easternMonth, easternDay, 12, 0, 0, 0))
  
  // Calculate ISO week number
  // ISO week: week 1 is the week with the first Thursday of the year
  const jan4 = new Date(Date.UTC(easternYear, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7 // Convert Sunday (0) to 7
  const week1Start = new Date(Date.UTC(easternYear, 0, 4 - jan4Day + 1))
  
  const weekNumber = Math.floor((easternDate.getTime() - week1Start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  
  // Handle edge case: if date is in previous year's last week
  if (weekNumber === 0) {
    const prevYear = easternYear - 1
    const prevJan4 = new Date(Date.UTC(prevYear, 0, 4))
    const prevJan4Day = prevJan4.getUTCDay() || 7
    const prevWeek1Start = new Date(Date.UTC(prevYear, 0, 4 - prevJan4Day + 1))
    const prevWeekNumber = Math.floor((easternDate.getTime() - prevWeek1Start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    return `${prevYear}-${String(prevWeekNumber).padStart(2, '0')}`
  }
  
  // Handle edge case: if week number is 53, it might belong to next year
  if (weekNumber === 53) {
    const dec31 = new Date(Date.UTC(easternYear, 11, 31))
    const dec31Day = dec31.getUTCDay() || 7 // Convert Sunday (0) to 7
    // If Dec 31 is Monday-Thursday (1-4), week 53 belongs to current year
    // If Dec 31 is Friday-Sunday (5-7), week 53 belongs to next year
    // Note: Sunday is 7 after conversion, so >= 5 correctly includes Friday (5), Saturday (6), and Sunday (7)
    if (dec31Day >= 5) {
      return `${easternYear + 1}-01`
    }
  }
  
  return `${easternYear}-${String(weekNumber).padStart(2, '0')}`
}

/**
 * Job: Send weekly email digests to all subscribed users
 * Runs: Fridays @ 9 AM EST
 */
export async function sendWeeklyDigests(payload: unknown, helpers: JobHelpers): Promise<void> {
  const { logger, job } = helpers
  logger.info('Starting weekly digest email job')

  try {
    // Generate week identifier for this week's digest
    const weekIdentifier = getWeekIdentifier()
    logger.info(`Week identifier: ${weekIdentifier}`)

    // Check which users already received this week's digest (prevent duplicates on retry)
    const alreadySent = await db
      .select({
        userId: weeklyDigestSent.userId,
      })
      .from(weeklyDigestSent)
      .where(eq(weeklyDigestSent.weekIdentifier, weekIdentifier))

    const alreadySentUserIds = new Set(alreadySent.map((s) => s.userId))
    logger.info(`${alreadySentUserIds.size} users already received this week's digest`)

    // Generate digests for all users with active subscriptions
    logger.info('Generating weekly digests for all subscribed users...')
    const allDigests = await generateAllWeeklyDigests()

    // Filter out users who already received this week's digest
    const digests = allDigests.filter((digest) => !alreadySentUserIds.has(digest.userId))
    
    if (digests.length < allDigests.length) {
      logger.info(`Filtered out ${allDigests.length - digests.length} already-sent digests`)
    }

    // Initialize counters (used for logging and Sentry reporting)
    let successCount = 0
    let failureCount = 0

    if (digests.length === 0) {
      logger.info('No digests to send (no users with active subscriptions)')
      // Continue to reschedule job even when no digests exist
      // This ensures the job runs every Friday regardless of subscription count
    } else {
      logger.info(`Generated ${digests.length} digests. Sending emails...`)

      // Calculate date once for all emails to ensure consistency
      // This prevents different dates if the job runs across a day boundary
      // Use Eastern Time to match the digest's week identifier and user expectations
      // Format date in Eastern Time (e.g., "Jan 15")
      const emailDate = new Date().toLocaleDateString('en-CA', { 
        month: 'short', 
        day: 'numeric',
        timeZone: 'America/New_York' // Explicitly use Eastern Time zone
      })

      // Send emails in batches to avoid rate limits
      // Resend allows up to 100 emails per second on paid plans
      const batchSize = 50

      for (let i = 0; i < digests.length; i += batchSize) {
      const batch = digests.slice(i, i + batchSize)
      
      // Send emails in parallel within each batch
      const results = await Promise.allSettled(
        batch.map(async (digest) => {
          try {
            const { data, error } = await resend.emails.send({
              from: EMAIL_CONFIG.from,
              to: digest.userEmail,
              subject: `Your Weekly MP Update - ${emailDate}`,
              html: digest.html,
              text: digest.text,
            })

            if (error) {
              throw new Error(error.message || 'Unknown Resend error')
            }

            logger.debug(`Sent digest to ${digest.userEmail} (user: ${digest.userId})`)
            const resendId = data?.id || null
            
            // Mark email as sent in database to prevent duplicates on retry
            // Unique constraint on (userId, weekIdentifier) prevents duplicates
            // Retry insert up to 3 times to ensure record is created (critical for duplicate prevention)
            let insertSuccess = false
            let insertError: any = null
            const maxRetries = 3
            
            for (let retry = 0; retry < maxRetries; retry++) {
              try {
                await db.insert(weeklyDigestSent).values({
                  userId: digest.userId,
                  weekIdentifier,
                  jobId: String(job.id),
                  resendId,
                  deliveryStatus: 'sent',
                  updatedAt: new Date(),
                })
                insertSuccess = true
                break // Success, exit retry loop
              } catch (dbError: any) {
                insertError = dbError
                
                // If unique constraint violation, email was already sent - this is expected on retry
                // This means duplicate prevention is working (another job instance already recorded it)
                if (dbError?.code === '23505' || dbError?.message?.includes('unique constraint')) {
                  logger.debug(`Email already marked as sent for user ${digest.userId} (week ${weekIdentifier})`)
                  insertSuccess = true // Consider this success - duplicate prevention is working
                  break
                }
                
                // Other database errors - retry with exponential backoff
                if (retry < maxRetries - 1) {
                  const delayMs = Math.pow(2, retry) * 100 // 100ms, 200ms, 400ms
                  logger.warn(`Failed to mark email as sent for user ${digest.userId} (attempt ${retry + 1}/${maxRetries}), retrying in ${delayMs}ms:`, dbError)
                  await new Promise((resolve) => setTimeout(resolve, delayMs))
                } else {
                  // Final retry failed - log critical error
                  logger.error(`CRITICAL: Failed to mark email as sent for user ${digest.userId} after ${maxRetries} attempts. Email was sent but duplicate prevention may be compromised:`, dbError)
                }
              }
            }
            
            // If insert failed after all retries, email was sent but duplicate prevention is compromised
            // Return failure to indicate the operation (send + record) was incomplete
            // This ensures proper tracking and prevents the job from reporting false success
            if (!insertSuccess) {
              logger.error(`CRITICAL: Email sent to ${digest.userEmail} but database record creation failed. User may receive duplicate on job retry.`, insertError)
              return { 
                success: false, 
                userId: digest.userId, 
                email: digest.userEmail, 
                error: 'Failed to create duplicate prevention record after retries' 
              }
            }
            
            return { success: true, userId: digest.userId, email: digest.userEmail }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.error(`Failed to send digest to ${digest.userEmail}: ${errorMessage}`)
            return { success: false, userId: digest.userId, email: digest.userEmail, error: errorMessage }
          }
        })
      )

      // Count successes and failures for this batch only
      let batchSuccessCount = 0
      let batchFailureCount = 0
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            batchSuccessCount++
            successCount++
          } else {
            batchFailureCount++
            failureCount++
          }
        } else {
          batchFailureCount++
          failureCount++
        }
      }

      // Log batch progress (per-batch counts)
      logger.info(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(digests.length / batchSize)}: ${batchSuccessCount} sent, ${batchFailureCount} failed (total: ${successCount} sent, ${failureCount} failed)`)

        // Small delay between batches to avoid rate limits
        if (i + batchSize < digests.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      logger.info(`Weekly digest job completed: ${successCount} sent, ${failureCount} failed out of ${digests.length} total`)
    }

    // Reschedule job for next Friday @ 9 AM EST
    // Wrap validation and rescheduling in try-catch to prevent job failure
    // after emails have already been sent (which would cause duplicate emails on retry)
    try {
      const weeklyDigestSchedule = process.env.WEEKLY_DIGEST_SCHEDULE || '09 00'
      const scheduleParts = weeklyDigestSchedule.trim().split(/\s+/)
      
      // Proper validation: check for invalid format first
      if (scheduleParts.length < 2) {
        throw new Error(`Invalid weekly digest schedule format: ${weeklyDigestSchedule}. Expected "HH MM" (24-hour format)`)
      }
      
      // Parse with proper validation (don't use || operator as 0 is a valid value)
      const scheduleHour = parseInt(scheduleParts[0], 10)
      const scheduleMinute = parseInt(scheduleParts[1], 10)
      
      // Validate hour (0-23)
      if (isNaN(scheduleHour) || scheduleHour < 0 || scheduleHour > 23) {
        throw new Error(`Invalid hour in weekly digest schedule: ${scheduleHour}`)
      }
      
      // Validate minute (0-59)
      if (isNaN(scheduleMinute) || scheduleMinute < 0 || scheduleMinute > 59) {
        throw new Error(`Invalid minute in weekly digest schedule: ${scheduleMinute}`)
      }
      
      const nextRun = getNextFriday(scheduleHour, scheduleMinute)
      
      await helpers.addJob(
        'sendWeeklyDigests',
        {},
        {
          jobKey: 'send-weekly-digests-weekly',
          jobKeyMode: 'replace',
          runAt: nextRun,
        }
      )
      logger.info(`Rescheduled weekly digest job for next Friday: ${nextRun.toISOString()}`)
    } catch (rescheduleError) {
      // Log warning but don't fail the job - emails have already been sent
      // External scheduler will handle rescheduling if needed
      logger.warn('Failed to reschedule weekly digest job (emails were sent successfully):', rescheduleError as any)
    }

    // Report failures to Sentry if there were any
    // Wrap in try-catch to prevent Sentry errors from causing job failure
    // after emails have already been sent (which would cause duplicate emails on retry)
    if (failureCount > 0) {
      try {
        const sentry = await getSentry()
        if (sentry) {
          sentry.captureMessage(`Weekly digest job had ${failureCount} failures`, {
            level: 'warning',
            tags: {
              job: 'sendWeeklyDigests',
            },
            extra: {
              total: digests.length,
              success: successCount,
              failures: failureCount,
            },
          })
        }
      } catch (sentryError) {
        // Log warning but don't fail the job - emails have already been sent
        logger.warn('Failed to report failures to Sentry (emails were sent successfully):', sentryError as any)
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Weekly digest job failed: ${errorMessage}`, { error })

    // Send to Sentry
    // Wrap in try-catch to prevent Sentry initialization failures from obscuring the original error
    try {
      const sentry = await getSentry()
      if (sentry) {
        sentry.captureException(error, {
          tags: {
            job: 'sendWeeklyDigests',
          },
        })
      }
    } catch (sentryError) {
      // Log warning but don't fail the job - the original error is more important
      logger.warn('Failed to report error to Sentry:', sentryError as any)
    }

    throw error
  }
}

/**
 * Task list for Graphile Worker
 * Export all email job functions here
 */
export const taskList = {
  sendWeeklyDigests,
}

