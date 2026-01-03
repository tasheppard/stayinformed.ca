import { JobHelpers } from 'graphile-worker'
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
  const { logger } = helpers
  logger.info('Starting MP list scraping job...')

  // Get sourceUrl from scraper instance (for error reporting if scraper fails)
  // Store it outside try block so it's available in catch block
  let sourceUrl: string | undefined
  try {
    const scraper = new MPListScraper({
      usePlaywright: false, // XML should be sufficient
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
        logger.warn('Failed to schedule scrapeMPDetails job:', scheduleError)
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
      logger.warn('Failed to report error to Sentry:', sentryError)
    }

    throw error
  }
}

/**
 * Job function to scrape MP details from XML endpoints
 * Runs MPDetailScraper and handles errors
 */
export async function scrapeMPDetails(payload: unknown, helpers: JobHelpers): Promise<void> {
  const { logger } = helpers
  logger.info('Starting MP details scraping job...')

  // Get sourceUrl from scraper instance (for error reporting if scraper fails)
  // Store it outside try block so it's available in catch block
  let sourceUrl: string | undefined
  try {
    const scraper = new MPDetailScraper({
      usePlaywright: true, // Enable Playwright fallback for failed XML requests
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
      logger.warn('Failed to report error to Sentry:', sentryError)
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
}

