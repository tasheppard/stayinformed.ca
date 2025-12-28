import { Task, TaskList } from 'graphile-worker'
import { VotesScraper } from '../lib/scrapers/votes-scraper'
import { BillsScraper } from '../lib/scrapers/bills-scraper'
import { ExpensesScraper } from '../lib/scrapers/expenses-scraper'
import { PetitionsScraper } from '../lib/scrapers/petitions-scraper'
import { CommitteesScraper } from '../lib/scrapers/committees-scraper'
import { MPProfileScraper } from '../lib/scrapers/mp-profile-scraper'
import * as Sentry from '@sentry/node'

// Initialize Sentry if SENTRY_DSN is set
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0,
  })
}

/**
 * Job: Scrape voting records
 * Runs: Hourly on sitting days
 */
async function scrapeVotes(payload: unknown, helpers: Task) {
  const { logger } = helpers
  logger.info('Starting votes scraper job')

  try {
    const scraper = new VotesScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
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
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Job: Scrape bills
 * Runs: Daily
 */
async function scrapeBills(payload: unknown, helpers: Task) {
  const { logger } = helpers
  logger.info('Starting bills scraper job')

  try {
    const scraper = new BillsScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
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
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Job: Scrape expenses
 * Runs: Daily
 */
async function scrapeExpenses(payload: unknown, helpers: Task) {
  const { logger } = helpers
  logger.info('Starting expenses scraper job')

  try {
    const scraper = new ExpensesScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
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
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Job: Scrape petitions
 * Runs: Daily
 */
async function scrapePetitions(payload: unknown, helpers: Task) {
  const { logger } = helpers
  logger.info('Starting petitions scraper job')

  try {
    const scraper = new PetitionsScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
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
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Job: Scrape committee participation
 * Runs: Daily
 */
async function scrapeCommittees(payload: unknown, helpers: Task) {
  const { logger } = helpers
  logger.info('Starting committees scraper job')

  try {
    const scraper = new CommitteesScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
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
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Job: Scrape MP profile photos
 * Runs: Weekly (Sunday)
 */
async function scrapeMPProfiles(payload: unknown, helpers: Task) {
  const { logger } = helpers
  logger.info('Starting MP profile scraper job')

  try {
    const scraper = new MPProfileScraper({
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      usePlaywright: true,
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
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Task list for Graphile Worker
 */
export const taskList: TaskList = {
  scrapeVotes,
  scrapeBills,
  scrapeExpenses,
  scrapePetitions,
  scrapeCommittees,
  scrapeMPProfiles,
}

