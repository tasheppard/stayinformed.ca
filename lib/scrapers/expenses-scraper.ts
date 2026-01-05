import { parseString } from 'xml2js'
import { promisify } from 'util'
import { BaseScraper, ScraperResult } from './base-scraper'
import { db } from '../db'
import { expenses, mps } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { Browser, Page } from 'playwright'

const parseXML = promisify(parseString)

interface ExpenseData {
  mpId: number
  fiscalYear: number
  quarter: number
  category: string
  amount: number
  description?: string
  transactionDetails?: Record<string, unknown>
}

interface ExpensesXMLResponse {
  Expenses?: {
    Expense?: Array<{
      FiscalYear?: Array<{ _?: string }>
      Quarter?: Array<{ _?: string }>
      Member?: Array<{
        PersonId?: Array<{ _?: string }>
        PersonOfficialFirstName?: Array<{ _?: string }>
        PersonOfficialLastName?: Array<{ _?: string }>
      }>
      Category?: Array<{ _?: string }>
      Amount?: Array<{ _?: string }>
      Description?: Array<{ _?: string }>
      Transactions?: Array<{
        Transaction?: Array<Record<string, unknown>>
      }>
    }>
  }
}

/**
 * Scraper for expenses from ourcommons.ca/ProactiveDisclosure (XML)
 */
export class ExpensesScraper extends BaseScraper<ExpenseData> {
  private readonly baseUrl = 'https://www.ourcommons.ca/ProactiveDisclosure'

  protected getSourceUrl(): string {
    return this.baseUrl
  }

  protected async scrapeXML(): Promise<ScraperResult<ExpenseData[]>> {
    try {
      this.logInfo('Fetching expenses XML...')

      const response = await fetch(this.baseUrl, {
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const xmlText = await response.text()
      const parsed = (await parseXML(xmlText)) as ExpensesXMLResponse

      if (!parsed.Expenses?.Expense) {
        return {
          success: false,
          error: 'No expenses found in XML response',
        }
      }

      const expenseData: ExpenseData[] = []
      const mpPersonIdMap = await this.getMPPersonIdMap()
      const mpNameMap = await this.getMPNameMap() // Fallback for backward compatibility

      for (const expense of parsed.Expenses.Expense) {
        const fiscalYear = parseInt(expense.FiscalYear?.[0]?._ || '0', 10)
        const quarter = parseInt(expense.Quarter?.[0]?._ || '0', 10)
        const personId = expense.Member?.[0]?.PersonId?.[0]?._ || ''
        const firstName = expense.Member?.[0]?.PersonOfficialFirstName?.[0]?._ || ''
        const lastName = expense.Member?.[0]?.PersonOfficialLastName?.[0]?._ || ''
        const category = expense.Category?.[0]?._ || ''
        const amountStr = expense.Amount?.[0]?._ || '0'
        const description = expense.Description?.[0]?._ || undefined
        const transactions = expense.Transactions?.[0]?.Transaction || []

        if (!fiscalYear || !quarter || !category) {
          this.logWarning('Skipping expense with missing required fields')
          continue
        }

        // Try PersonId matching first (preferred method)
        let mpId: number | undefined
        if (personId) {
          mpId = mpPersonIdMap.get(personId)
          if (!mpId) {
            this.logWarning(`MP not found by PersonId: ${personId} (${firstName} ${lastName})`)
          }
        }

        // Fallback to name matching if PersonId not available or not found
        if (!mpId) {
          if (firstName && lastName) {
            const fullName = `${firstName} ${lastName}`.trim()
            mpId = mpNameMap.get(fullName)
            if (!mpId) {
              this.logWarning(`MP not found in database: ${fullName}${personId ? ` (PersonId: ${personId})` : ''}`)
              continue
            }
            // Log when using fallback name matching
            if (personId) {
              this.logWarning(`Using name fallback for PersonId ${personId} (${fullName})`)
            }
          } else {
            this.logWarning(`Skipping expense: missing name and PersonId`)
            continue
          }
        }

        const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, '')) || 0

        // Build transaction details for premium users
        const transactionDetails: Record<string, unknown> = {}
        if (transactions.length > 0) {
          transactionDetails.transactions = transactions
        }

        expenseData.push({
          mpId,
          fiscalYear,
          quarter,
          category,
          amount,
          description,
          transactionDetails: Object.keys(transactionDetails).length > 0 ? transactionDetails : undefined,
        })
      }

      this.logInfo(`Scraped ${expenseData.length} expenses`)
      return {
        success: true,
        data: expenseData,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected async scrapeWithPlaywright(): Promise<ScraperResult<ExpenseData[]>> {
    try {
      this.logInfo('Scraping expenses with Playwright...')
      const browser = await this.getBrowser()
      const page = await browser.newPage()

      try {
        await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: this.timeout })

        // Wait for XML content to load
        await page.waitForSelector('body', { timeout: this.timeout })

        const xmlContent = await page.content()
        const parsed = (await parseXML(xmlContent)) as ExpensesXMLResponse

        // Reuse XML parsing logic
        const xmlResult = await this.scrapeXML()
        if (xmlResult.success) {
          return xmlResult
        }

        throw new Error('Playwright fallback: Unable to parse XML from page')
      } finally {
        await page.close()
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected validateData(data: ExpenseData[]): { isValid: boolean; anomalies: string[] } {
    const anomalies: string[] = []

    // Check for required fields
    const missingFields = data.filter(
      (expense) => !expense.mpId || !expense.fiscalYear || !expense.quarter || !expense.category
    )
    if (missingFields.length > 0) {
      anomalies.push(`${missingFields.length} expenses with missing required fields`)
    }

    // Check for valid quarter (1-4)
    const invalidQuarters = data.filter((expense) => expense.quarter < 1 || expense.quarter > 4)
    if (invalidQuarters.length > 0) {
      anomalies.push(`${invalidQuarters.length} expenses with invalid quarter values`)
    }

    // Check for negative amounts (might be valid, but flag for review)
    const negativeAmounts = data.filter((expense) => expense.amount < 0)
    if (negativeAmounts.length > 0) {
      anomalies.push(`${negativeAmounts.length} expenses with negative amounts`)
    }

    // Check for unusually large amounts (>$100,000)
    const largeAmounts = data.filter((expense) => expense.amount > 100000)
    if (largeAmounts.length > 0) {
      anomalies.push(`${largeAmounts.length} expenses with unusually large amounts (>$100k)`)
    }

    return {
      isValid: anomalies.length === 0,
      anomalies,
    }
  }

  protected async saveToDatabase(data: ExpenseData[]): Promise<void> {
    this.logInfo(`Saving ${data.length} expenses to database...`)

    for (const expense of data) {
      try {
        // Check if expense already exists
        const existing = await db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.mpId, expense.mpId),
              eq(expenses.fiscalYear, expense.fiscalYear),
              eq(expenses.quarter, expense.quarter),
              eq(expenses.category, expense.category)
            )
          )
          .limit(1)

        if (existing.length === 0) {
          await db.insert(expenses).values({
            mpId: expense.mpId,
            fiscalYear: expense.fiscalYear,
            quarter: expense.quarter,
            category: expense.category,
            amount: expense.amount.toString(),
            description: expense.description,
            transactionDetails: expense.transactionDetails,
          })
        } else {
          // Update existing expense
          await db
            .update(expenses)
            .set({
              amount: expense.amount.toString(),
              description: expense.description,
              transactionDetails: expense.transactionDetails,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(expenses.mpId, expense.mpId),
                eq(expenses.fiscalYear, expense.fiscalYear),
                eq(expenses.quarter, expense.quarter),
                eq(expenses.category, expense.category)
              )
            )
        }
      } catch (error) {
        this.logError(
          `Failed to save expense for MP ${expense.mpId}, FY ${expense.fiscalYear} Q${expense.quarter}:`,
          error
        )
      }
    }

    this.logInfo('Expenses saved successfully')
  }

  /**
   * Get a map of MP PersonIds to their database IDs
   * This is the preferred method for matching MPs
   */
  private async getMPPersonIdMap(): Promise<Map<string, number>> {
    const allMPs = await db
      .select({ id: mps.id, personId: mps.personId })
      .from(mps)
      .where(sql`${mps.personId} IS NOT NULL`)
    
    const map = new Map<string, number>()
    
    for (const mp of allMPs) {
      if (mp.personId) {
        map.set(mp.personId, mp.id)
      }
    }
    
    return map
  }

  /**
   * Get a map of MP full names to their IDs
   * Used as fallback for backward compatibility when PersonId is not available
   */
  private async getMPNameMap(): Promise<Map<string, number>> {
    const allMPs = await db.select({ id: mps.id, fullName: mps.fullName }).from(mps)
    const map = new Map<string, number>()

    for (const mp of allMPs) {
      map.set(mp.fullName, mp.id)
    }

    return map
  }
}

