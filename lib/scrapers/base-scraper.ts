import { db } from '../db'
import type { Browser } from 'playwright'

// Lazy load Sentry to avoid initialization issues
let Sentry: typeof import('@sentry/node') | null = null

async function getSentry() {
  if (!Sentry && process.env.SENTRY_DSN) {
    Sentry = await import('@sentry/node')
  }
  return Sentry
}

export interface ScraperResult<T> {
  success: boolean
  data?: T
  error?: string
  sourceUrl?: string
}

export interface ScraperOptions {
  maxRetries?: number
  retryDelay?: number
  timeout?: number
  usePlaywright?: boolean
}

/**
 * Base scraper class with error handling, retry logic, and hybrid scraping support
 */
export abstract class BaseScraper<T> {
  protected maxRetries: number
  protected retryDelay: number
  protected timeout: number
  protected usePlaywright: boolean
  protected browser?: Browser

  constructor(options: ScraperOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3
    this.retryDelay = options.retryDelay ?? 5000 // 5 seconds
    this.timeout = options.timeout ?? 30000 // 30 seconds
    this.usePlaywright = options.usePlaywright ?? false
  }

  /**
   * Main scrape method with retry logic
   */
  async scrape(): Promise<ScraperResult<T[]>> {
    let lastError: Error | null = null
    let xmlFailures = 0

    // Try XML first (primary method)
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.scrapeXML()
        if (result.success) {
          return result
        }
        xmlFailures++
      } catch (error) {
        lastError = error as Error
        xmlFailures++
        this.logError(`XML scrape attempt ${attempt} failed:`, error)
      }

      if (attempt < this.maxRetries) {
        await this.delay(this.retryDelay * attempt)
      }
    }

    // If XML fails maxRetries times consecutively, fallback to Playwright
    if (xmlFailures >= this.maxRetries && this.usePlaywright) {
      this.logInfo(`XML scraping failed ${xmlFailures} times (maxRetries: ${this.maxRetries}), falling back to Playwright`)
      try {
        return await this.scrapeWithPlaywright()
      } catch (error) {
        lastError = error as Error
        this.logError('Playwright fallback also failed:', error)
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All scraping attempts failed',
    }
  }

  /**
   * Primary scraping method using XML parsing
   * Must be implemented by subclasses
   */
  protected abstract scrapeXML(): Promise<ScraperResult<T[]>>

  /**
   * Fallback scraping method using Playwright
   * Must be implemented by subclasses
   */
  protected abstract scrapeWithPlaywright(): Promise<ScraperResult<T[]>>

  /**
   * Validate scraped data
   * Must be implemented by subclasses
   */
  protected abstract validateData(data: T[]): { isValid: boolean; anomalies: string[] }

  /**
   * Save data to database
   * Must be implemented by subclasses
   */
  protected abstract saveToDatabase(data: T[]): Promise<void>

  /**
   * Get the source URL for this scraper
   */
  protected abstract getSourceUrl(): string

  /**
   * Delay helper
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Log error with Sentry integration
   */
  protected logError(message: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[${this.constructor.name}] ${message}`, errorMessage)
    
    // Send to Sentry asynchronously (fire and forget)
    getSentry().then((sentry) => {
      if (sentry) {
        sentry.captureException(error, {
          tags: {
            scraper: this.constructor.name,
          },
          extra: {
            message,
          },
        })
      }
    }).catch(() => {
      // Ignore Sentry errors
    })
  }

  /**
   * Log info message
   */
  protected logInfo(message: string): void {
    console.log(`[${this.constructor.name}] ${message}`)
  }

  /**
   * Log warning
   */
  protected logWarning(message: string): void {
    console.warn(`[${this.constructor.name}] ${message}`)
  }

  /**
   * Initialize Playwright browser (lazy loading)
   */
  protected async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const { chromium } = await import('playwright')
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
    }
    return this.browser
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = undefined
    }
  }

  /**
   * Run full scrape workflow: scrape -> validate -> save
   */
  async run(): Promise<ScraperResult<T[]>> {
    try {
      // Scrape data
      const result = await this.scrape()
      
      if (!result.success || !result.data) {
        return result
      }

      // Validate data
      const validation = this.validateData(result.data)
      
      if (!validation.isValid) {
        this.logWarning(`Data validation found anomalies: ${validation.anomalies.join(', ')}`)
        // Still save data but flag anomalies
        await this.flagAnomalies(validation.anomalies)
      }

      // Save to database
      await this.saveToDatabase(result.data)

      return {
        ...result,
        sourceUrl: this.getSourceUrl(),
      }
    } catch (error) {
      this.logError('Scrape workflow failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      await this.cleanup()
    }
  }

  /**
   * Flag anomalies for manual review
   */
  protected async flagAnomalies(anomalies: string[]): Promise<void> {
    // TODO: Implement anomaly tracking table
    this.logWarning(`Anomalies detected: ${anomalies.join(', ')}`)
    
    // Send to Sentry asynchronously (fire and forget)
    getSentry().then((sentry) => {
      if (sentry) {
        sentry.captureMessage('Data anomalies detected', {
          level: 'warning',
          tags: {
            scraper: this.constructor.name,
          },
          extra: {
            anomalies,
          },
        })
      }
    }).catch(() => {
      // Ignore Sentry errors
    })
  }
}

