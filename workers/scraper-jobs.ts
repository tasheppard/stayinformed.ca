import { JobHelpers } from 'graphile-worker'
import { VotesScraper } from '../lib/scrapers/votes-scraper'
import { BillsScraper } from '../lib/scrapers/bills-scraper'
import { ExpensesScraper } from '../lib/scrapers/expenses-scraper'
import { PetitionsScraper } from '../lib/scrapers/petitions-scraper'
import { CommitteesScraper } from '../lib/scrapers/committees-scraper'
import { MPProfileScraper } from '../lib/scrapers/mp-profile-scraper'
import { MPListScraper } from '../lib/scrapers/mp-list-scraper'
import { MPDetailScraper } from '../lib/scrapers/mp-detail-scraper'

// Lazy load Sentry to avoid initialization issues
let Sentry: typeof import('@sentry/node') | null = null

async function getSentry() {
  if (!Sentry && process.env.SENTRY_DSN) {
    Sentry = await import('@sentry/node')
  }
  return Sentry
}

/**
 * Job function to scrape MP list from XML endpoint
 * Runs MPListScraper and handles errors
 * After successful completion, schedules scrapeMPDetails job to ensure sequencing
 */
export async function scrapeMPList(payload: unknown, helpers: JobHelpers): Promise<void> {
  const { logger, job } = helpers
  logger.info('Starting MP list scraping job...')

  // Get sourceUrl from scraper instance (for error reporting if scraper fails)
  // Store it outside try block so it's available in catch block
  let sourceUrl: string | undefined
  try {
    const scraper = new MPListScraper({
      usePlaywright: false, // XML should be sufficient
      jobId: job.id,
    })

    // getSourceUrl() is protected, so we access it via type casting
    sourceUrl = (scraper as any).getSourceUrl()

    const result = await scraper.run()

    if (result.success) {
      logger.info(
        `MP list scraping completed successfully. Processed ${result.data?.length || 0} MPs.`
      )

      // Schedule scrapeMPDetails to run after MP list scraping completes
      // This ensures proper sequencing: MPListScraper must complete before MPDetailScraper starts
      // Since scraper.run() completes all database operations before returning, we can schedule immediately
      // Use a different job key than the daily scheduler to avoid replacing the scheduled daily job
      try {
        await helpers.addJob(
          'scrape-mp-details',
          {},
          {
            jobKey: 'scrape-mp-details-after-list',
            jobKeyMode: 'replace',
            // Schedule immediately - scraper.run() has already completed all database operations
            // No delay needed since the database transaction is committed before this point
          }
        )
        logger.info('Scheduled scrapeMPDetails job to run after MP list scraping completes')
      } catch (scheduleError) {
        logger.warn('Failed to schedule scrapeMPDetails job:', scheduleError as any)
        // Don't fail the entire job if scheduling fails - the external scheduler will handle it
      }
    } else {
      const errorMessage = result.error || 'Unknown error'
      logger.error(`MP list scraping failed: ${errorMessage}`)
      
      // Create error with sourceUrl in extra data for catch block to use
      // Use sourceUrl from scraper instance since result.sourceUrl is undefined on failure
      const error = new Error(errorMessage)
      ;(error as any).sourceUrl = sourceUrl
      throw error
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`MP list scraping job failed: ${errorMessage}`, { error })

    // Attach sourceUrl to error if not already attached (for Sentry reporting)
    // Use sourceUrl from scraper instance since result.sourceUrl is undefined on failure
    if (error instanceof Error && !(error as any).sourceUrl && sourceUrl) {
      ;(error as any).sourceUrl = sourceUrl
    }

    // Send to Sentry (only once, here in the catch block)
    // Wrap in try-catch to prevent Sentry errors from masking the original error
    try {
      const sentry = await getSentry()
      if (sentry) {
        const errorSourceUrl = (error as any)?.sourceUrl || sourceUrl
        sentry.captureException(error, {
          tags: {
            job: 'scrapeMPList',
            scraper: 'MPListScraper',
          },
          extra: errorSourceUrl ? { sourceUrl: errorSourceUrl } : undefined,
        })
      }
    } catch (sentryError) {
      // Log Sentry error but don't let it mask the original error
      logger.warn('Failed to report error to Sentry:', sentryError as any)
    }

    throw error
  }
}

/**
 * Job function to scrape MP details from XML endpoints
 * Runs MPDetailScraper and handles errors
 */
export async function scrapeMPDetails(payload: unknown, helpers: JobHelpers): Promise<void> {
  const { logger, job } = helpers
  logger.info('Starting MP details scraping job...')

  // Get sourceUrl from scraper instance (for error reporting if scraper fails)
  // Store it outside try block so it's available in catch block
  let sourceUrl: string | undefined
  try {
    const scraper = new MPDetailScraper({
      usePlaywright: true, // Enable Playwright fallback for failed XML requests
      jobId: job.id,
    })

    // getSourceUrl() is protected, so we access it via type casting
    sourceUrl = (scraper as any).getSourceUrl()

    const result = await scraper.run()

    if (result.success) {
      logger.info(
        `MP details scraping completed successfully. Processed ${result.data?.length || 0} MPs.`
      )
    } else {
      const errorMessage = result.error || 'Unknown error'
      logger.error(`MP details scraping failed: ${errorMessage}`)
      
      // Create error with sourceUrl in extra data for catch block to use
      // Use sourceUrl from scraper instance since result.sourceUrl is undefined on failure
      const error = new Error(errorMessage)
      ;(error as any).sourceUrl = sourceUrl
      throw error
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`MP details scraping job failed: ${errorMessage}`, { error })

    // Attach sourceUrl to error if not already attached (for Sentry reporting)
    // Use sourceUrl from scraper instance since result.sourceUrl is undefined on failure
    if (error instanceof Error && !(error as any).sourceUrl && sourceUrl) {
      ;(error as any).sourceUrl = sourceUrl
    }

    // Send to Sentry (only once, here in the catch block)
    // Wrap in try-catch to prevent Sentry errors from masking the original error
    try {
      const sentry = await getSentry()
      if (sentry) {
        const errorSourceUrl = (error as any)?.sourceUrl || sourceUrl
        sentry.captureException(error, {
          tags: {
            job: 'scrapeMPDetails',
            scraper: 'MPDetailScraper',
          },
          extra: errorSourceUrl ? { sourceUrl: errorSourceUrl } : undefined,
        })
      }
    } catch (sentryError) {
      // Log Sentry error but don't let it mask the original error
      logger.warn('Failed to report error to Sentry:', sentryError as any)
    }

    throw error
  }
}

/**
 * Job: Scrape voting records
 * Runs: Hourly on sitting days
 */
async function scrapeVotes(payload: unknown, helpers: JobHelpers) {
  const { logger, job } = helpers
  logger.info('Starting votes scraper job')

  try {
    const scraper = new VotesScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
      jobId: job.id,
    })

    const result = await scraper.run()

    if (result.success) {
      logger.info(`Votes scraper completed successfully: ${result.data?.length || 0} votes scraped`)
    } else {
      logger.error(`Votes scraper failed: ${result.error}`)
      throw new Error(result.error)
    }
  } catch (error) {
    logger.error('Votes scraper job failed', { error })
    const sentry = await getSentry()
    if (sentry) {
      sentry.captureException(error)
    }
    throw error
  }
}

/**
 * Job: Scrape bills
 * Runs: Daily
 */
async function scrapeBills(payload: unknown, helpers: JobHelpers) {
  const { logger, job } = helpers
  logger.info('Starting bills scraper job')

  try {
    const scraper = new BillsScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
      jobId: job.id,
    })

    const result = await scraper.run()

    if (result.success) {
      logger.info(`Bills scraper completed successfully: ${result.data?.length || 0} bills scraped`)
    } else {
      logger.error(`Bills scraper failed: ${result.error}`)
      throw new Error(result.error)
    }
  } catch (error) {
    logger.error('Bills scraper job failed', { error })
    const sentry = await getSentry()
    if (sentry) {
      sentry.captureException(error)
    }
    throw error
  }
}

/**
 * Job: Scrape expenses
 * Runs: Daily
 */
async function scrapeExpenses(payload: unknown, helpers: JobHelpers) {
  const { logger, job } = helpers
  logger.info('Starting expenses scraper job')

  try {
    const scraper = new ExpensesScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
      jobId: job.id,
    })

    const result = await scraper.run()

    if (result.success) {
      logger.info(`Expenses scraper completed successfully: ${result.data?.length || 0} expenses scraped`)
    } else {
      logger.error(`Expenses scraper failed: ${result.error}`)
      throw new Error(result.error)
    }
  } catch (error) {
    logger.error('Expenses scraper job failed', { error })
    const sentry = await getSentry()
    if (sentry) {
      sentry.captureException(error)
    }
    throw error
  }
}

/**
 * Job: Scrape petitions
 * Runs: Daily
 */
async function scrapePetitions(payload: unknown, helpers: JobHelpers) {
  const { logger, job } = helpers
  logger.info('Starting petitions scraper job')

  try {
    const scraper = new PetitionsScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
      jobId: job.id,
    })

    const result = await scraper.run()

    if (result.success) {
      logger.info(`Petitions scraper completed successfully: ${result.data?.length || 0} petitions scraped`)
    } else {
      logger.error(`Petitions scraper failed: ${result.error}`)
      throw new Error(result.error)
    }
  } catch (error) {
    logger.error('Petitions scraper job failed', { error })
    const sentry = await getSentry()
    if (sentry) {
      sentry.captureException(error)
    }
    throw error
  }
}

/**
 * Job: Scrape committee participation
 * Runs: Daily
 */
async function scrapeCommittees(payload: unknown, helpers: JobHelpers) {
  const { logger, job } = helpers
  logger.info('Starting committees scraper job')

  try {
    const scraper = new CommitteesScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
      jobId: job.id,
    })

    const result = await scraper.run()

    if (result.success) {
      logger.info(`Committees scraper completed successfully: ${result.data?.length || 0} participations scraped`)
    } else {
      logger.error(`Committees scraper failed: ${result.error}`)
      throw new Error(result.error)
    }
  } catch (error) {
    logger.error('Committees scraper job failed', { error })
    const sentry = await getSentry()
    if (sentry) {
      sentry.captureException(error)
    }
    throw error
  }
}

/**
 * Job: Scrape MP profile photos
 * Runs: Weekly (Sunday)
 */
async function scrapeMPProfiles(payload: unknown, helpers: JobHelpers) {
  const { logger, job } = helpers
  logger.info('Starting MP profile scraper job')

  try {
    const scraper = new MPProfileScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
      jobId: job.id,
    })

    const result = await scraper.run()

    if (result.success) {
      logger.info(`MP profile scraper completed successfully: ${result.data?.length || 0} profiles scraped`)
    } else {
      logger.error(`MP profile scraper failed: ${result.error}`)
      throw new Error(result.error)
    }
  } catch (error) {
    logger.error('MP profile scraper job failed', { error })
    const sentry = await getSentry()
    if (sentry) {
      sentry.captureException(error)
    }
    throw error
  }
}

/**
 * Job: Recalculate accountability scores for all MPs
 * Runs: Daily at 1 AM EST
 */
async function recalculateScores(payload: unknown, helpers: JobHelpers) {
  const { logger } = helpers
  logger.info('Starting score recalculation job')

  try {
    const { calculateAllMPScores, saveScores } = await import('../lib/scoring/calculate-scores')
    
    logger.info('Calculating scores for all MPs...')
    const scores = await calculateAllMPScores()
    
    logger.info(`Calculated scores for ${scores.length} MPs`)
    
    logger.info('Saving scores to database...')
    await saveScores(scores)
    
    logger.info('Score recalculation completed successfully')
  } catch (error) {
    logger.error('Score recalculation job failed', { error })
    const sentry = await getSentry()
    if (sentry) {
      sentry.captureException(error)
    }
    throw error
  }
}

/**
 * Task list for Graphile Worker
 * Export all job functions here
 */
export const taskList = {
  'scrape-mp-list': scrapeMPList,
  'scrape-mp-details': scrapeMPDetails,
  scrapeVotes,
  scrapeBills,
  scrapeExpenses,
  scrapePetitions,
  scrapeCommittees,
  scrapeMPProfiles,
  recalculateScores,
}
