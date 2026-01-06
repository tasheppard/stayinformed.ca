import { db } from '../db'
import { scraperAnomalies } from '../db/schema'
import { eq } from 'drizzle-orm'
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
  jobId?: string | number // Graphile Worker job ID (string in Graphile Worker 0.16.6+)
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
  protected jobId?: string | number // Graphile Worker job ID (string in Graphile Worker 0.16.6+)

  constructor(options: ScraperOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3
    this.retryDelay = options.retryDelay ?? 5000 // 5 seconds
    this.timeout = options.timeout ?? 30000 // 30 seconds
    this.usePlaywright = options.usePlaywright ?? false
    this.jobId = options.jobId
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
    if (anomalies.length === 0) return
    
    this.logWarning(`Anomalies detected: ${anomalies.join(', ')}`)
    
    // Store each anomaly in the database
    try {
      for (const anomaly of anomalies) {
        // Convert jobId to string if it exists (Graphile Worker uses string IDs)
        const jobIdString = this.jobId != null ? String(this.jobId) : null
        
        await db.insert(scraperAnomalies).values({
          scraperName: this.constructor.name,
          jobId: jobIdString,
          anomalyType: 'data_validation',
          description: anomaly,
          severity: this.determineSeverity(anomaly),
          status: 'pending',
        })
      }
    } catch (error) {
      // Log error but don't fail the scraper if anomaly storage fails
      this.logError('Failed to store anomalies in database:', error)
    }
    
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

  /**
   * Determine severity level based on anomaly description
   * 
   * Critical: System failures, fatal errors, or explicitly critical issues
   * High: Data integrity issues that affect correctness
   * Medium: Recoverable issues or warnings (including recoverable errors)
   * Low: Minor anomalies that don't affect functionality
   */
  protected determineSeverity(anomaly: string): 'low' | 'medium' | 'high' | 'critical' {
    const lowerAnomaly = anomaly.toLowerCase()
    
    // Check for failed retry patterns first (these are critical, not recoverable)
    // Patterns like "retry exhausted", "retry failed", "failed retry", "retry limit reached" indicate failed recovery
    // Check for both word orders: "retry failed" and "failed retry" to catch all variations
    const isFailedRetry = 
      lowerAnomaly.includes('retry exhausted') ||
      lowerAnomaly.includes('retry failed') ||
      lowerAnomaly.includes('failed retry') ||
      lowerAnomaly.includes('failed retries') ||
      lowerAnomaly.includes('retry limit') ||
      lowerAnomaly.includes('max retries') ||
      lowerAnomaly.includes('retries exhausted') ||
      lowerAnomaly.includes('retry attempts exhausted')
    
    // Check for successful/ongoing retry patterns (these are recoverable/medium)
    // Only match if it's NOT a failed retry
    const isSuccessfulRetry = 
      !isFailedRetry && (
        lowerAnomaly.includes('retry') ||
        lowerAnomaly.includes('retrying')
      )
    
    // Check for other recoverable error patterns (should be medium, not critical)
    // Connection errors are typically transient and recoverable
    // Check for various connection error patterns, including "failed" + "connection" combinations
    const isConnectionError =
      lowerAnomaly.includes('connection error') ||
      lowerAnomaly.includes('connection failed') ||
      lowerAnomaly.includes('failed to connect') ||
      lowerAnomaly.includes('connect failed') ||
      lowerAnomaly.includes('failed connecting') ||
      lowerAnomaly.includes('connection timeout') ||
      (lowerAnomaly.includes('failed') && lowerAnomaly.includes('connection')) || // e.g., "failed connection attempt"
      (lowerAnomaly.includes('failed') && lowerAnomaly.includes('connect')) // e.g., "failed connect attempt"
    
    // Check for timeout-related failures
    const isTimeoutFailure =
      lowerAnomaly.includes('timeout') ||
      (lowerAnomaly.includes('failed') && lowerAnomaly.includes('timeout')) // e.g., "failed timeout"
    
    const isRecoverableError = 
      isSuccessfulRetry ||
      lowerAnomaly.includes('recovered') ||
      isConnectionError ||
      isTimeoutFailure
    
    // Check for data integrity issues (should be high, checked first to prioritize data correctness)
    // Data integrity issues maintain high severity regardless of recoverability or failed retries
    const isDataIntegrityIssue =
      lowerAnomaly.includes('invalid') ||
      lowerAnomaly.includes('missing') ||
      lowerAnomaly.includes('incorrect') ||
      lowerAnomaly.includes('corrupt') ||
      lowerAnomaly.includes('malformed') ||
      lowerAnomaly.includes('validation failed') ||
      lowerAnomaly.includes('data validation') ||
      lowerAnomaly.includes('duplicate') || // e.g., "duplicate votes detected", "duplicate PersonIds detected"
      lowerAnomaly.includes('negative') // e.g., "negative amounts", "negative signature counts", "negative meeting counts"
    
    // High: Data integrity issues that affect correctness (always high, even if recoverable or failed retry)
    // Check this FIRST to ensure data integrity takes precedence over all other classifications
    if (isDataIntegrityIssue) {
      return 'high'
    }
    
    // Critical: Failed retries are ALWAYS critical, regardless of other recoverable error patterns
    // Check this BEFORE medium to ensure failed retries take precedence over recoverable errors
    // Example: "max retries reached - timeout" should be critical, not medium
    if (isFailedRetry) {
      return 'critical'
    }
    
    // Medium: Recoverable issues, warnings, successful retries, timeouts, or recovered errors
    // Only classify as medium if NOT a data integrity issue and NOT a failed retry
    if (
      isRecoverableError ||
      lowerAnomaly.includes('warning') ||
      lowerAnomaly.includes('unexpected')
    ) {
      return 'medium'
    }
    
    // Critical: System failures, fatal errors (exclude recoverable errors and data integrity issues)
    // Note: "failed" is only critical if not a data integrity issue (e.g., "validation failed" is high, not critical)
    // Failed retries are already handled above, so this only checks for other critical system failures
    // Connection/timeout failures are already caught by isRecoverableError above
    if (
      !isRecoverableError && (
        lowerAnomaly.includes('critical') ||
        lowerAnomaly.includes('failed') ||
        lowerAnomaly.includes('fatal error') ||
        lowerAnomaly.includes('system error') ||
        lowerAnomaly.includes('database error') ||
        lowerAnomaly.includes('permission denied') ||
        lowerAnomaly.includes('access denied')
      )
    ) {
      return 'critical'
    }
    
    // Low: Everything else - minor issues that don't affect functionality
    return 'low'
  }
}

