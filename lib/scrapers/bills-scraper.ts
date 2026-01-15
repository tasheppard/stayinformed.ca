import { BaseScraper, ScraperResult } from './base-scraper'
import { db } from '../db'
import { bills, mps } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import type { Browser, Page } from 'playwright'

interface BillData {
  billNumber: string
  title: string
  sponsorMpId?: number
  introductionDate?: Date
  status?: string
  summary?: string
}

interface LegisInfoResponse {
  Bill?: {
    BillNumber?: string
    Title?: string
    Sponsor?: {
      Person?: {
        PersonId?: string
        PersonOfficialFirstName?: string
        PersonOfficialLastName?: string
      }
    }
    IntroductionDate?: string
    Status?: string
    Summary?: string
  }[]
}

/**
 * Scraper for bills from parl.ca/LegisInfo (JSON API)
 */
export class BillsScraper extends BaseScraper<BillData> {
  private readonly baseUrl = 'https://www.parl.ca/LegisInfo'

  protected getSourceUrl(): string {
    return this.baseUrl
  }

  protected async scrapeXML(): Promise<ScraperResult<BillData[]>> {
    try {
      this.logInfo('Fetching bills from LegisInfo API...')
      
      // Note: This is a JSON API, not XML, but we use the same interface
      const response = await fetch(this.baseUrl, {
        signal: AbortSignal.timeout(this.timeout),
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as LegisInfoResponse

      if (!data.Bill || data.Bill.length === 0) {
        return {
          success: false,
          error: 'No bills found in API response',
        }
      }

      const billData: BillData[] = []
      const mpPersonIdMap = await this.getMPPersonIdMap()
      const mpNameMap = await this.getMPNameMap() // Fallback for backward compatibility

      for (const bill of data.Bill) {
        if (!bill.BillNumber || !bill.Title) {
          this.logWarning('Skipping bill with missing required fields')
          continue
        }

        let sponsorMpId: number | undefined
        if (bill.Sponsor?.Person) {
          const personId = bill.Sponsor.Person.PersonId || ''
          const firstName = bill.Sponsor.Person.PersonOfficialFirstName || ''
          const lastName = bill.Sponsor.Person.PersonOfficialLastName || ''
          
          // Try PersonId matching first (preferred method)
          if (personId) {
            sponsorMpId = mpPersonIdMap.get(personId)
            if (!sponsorMpId && firstName && lastName) {
              this.logWarning(`MP not found by PersonId: ${personId} (${firstName} ${lastName})`)
            }
          }
          
          // Fallback to name matching if PersonId not available or not found
          if (!sponsorMpId && firstName && lastName) {
            const fullName = `${firstName} ${lastName}`.trim()
            sponsorMpId = mpNameMap.get(fullName)
            if (!sponsorMpId) {
              this.logWarning(`MP not found in database: ${fullName}${personId ? ` (PersonId: ${personId})` : ''}`)
            } else if (personId) {
              // Log when using fallback name matching
              this.logWarning(`Using name fallback for PersonId ${personId} (${fullName})`)
            }
          }
        }

        const introductionDate = bill.IntroductionDate
          ? new Date(bill.IntroductionDate)
          : undefined

        billData.push({
          billNumber: bill.BillNumber,
          title: bill.Title,
          sponsorMpId,
          introductionDate,
          status: bill.Status,
          summary: bill.Summary,
        })
      }

      this.logInfo(`Scraped ${billData.length} bills`)
      return {
        success: true,
        data: billData,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected async scrapeWithPlaywright(): Promise<ScraperResult<BillData[]>> {
    try {
      this.logInfo('Scraping bills with Playwright...')
      const browser = await this.getBrowser()
      const page = await browser.newPage()

      try {
        await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: this.timeout })
        
        // Try to extract JSON from page
        const jsonContent = await page.evaluate(() => {
          // Look for JSON data in script tags or API calls
          const scripts = Array.from(document.querySelectorAll('script'))
          for (const script of scripts) {
            const text = script.textContent || ''
            if (text.includes('Bill') && text.includes('BillNumber')) {
              try {
                return JSON.parse(text)
              } catch {
                // Try to extract JSON from text
                const match = text.match(/\{[\s\S]*\}/)
                if (match) {
                  try {
                    return JSON.parse(match[0])
                  } catch {
                    // Continue
                  }
                }
              }
            }
          }
          return null
        })

        if (jsonContent) {
          // Parse the extracted JSON
          const data = jsonContent as LegisInfoResponse
          if (!data.Bill || data.Bill.length === 0) {
            throw new Error('No bills found in extracted JSON')
          }

          const billData: BillData[] = []
          const mpPersonIdMap = await this.getMPPersonIdMap()
          const mpNameMap = await this.getMPNameMap() // Fallback for backward compatibility

          for (const bill of data.Bill) {
            if (!bill.BillNumber || !bill.Title) {
              continue
            }

            let sponsorMpId: number | undefined
            if (bill.Sponsor?.Person) {
              const personId = bill.Sponsor.Person.PersonId || ''
              const firstName = bill.Sponsor.Person.PersonOfficialFirstName || ''
              const lastName = bill.Sponsor.Person.PersonOfficialLastName || ''
              
              // Try PersonId matching first (preferred method)
              if (personId) {
                sponsorMpId = mpPersonIdMap.get(personId)
                if (!sponsorMpId && firstName && lastName) {
                  this.logWarning(`MP not found by PersonId: ${personId} (${firstName} ${lastName})`)
                }
              }
              
              // Fallback to name matching if PersonId not available or not found
              if (!sponsorMpId && firstName && lastName) {
                const fullName = `${firstName} ${lastName}`.trim()
                sponsorMpId = mpNameMap.get(fullName)
                if (!sponsorMpId) {
                  this.logWarning(`MP not found in database: ${fullName}${personId ? ` (PersonId: ${personId})` : ''}`)
                } else if (personId) {
                  // Log when using fallback name matching
                  this.logWarning(`Using name fallback for PersonId ${personId} (${fullName})`)
                }
              }
            }

            const introductionDate = bill.IntroductionDate
              ? new Date(bill.IntroductionDate)
              : undefined

            billData.push({
              billNumber: bill.BillNumber,
              title: bill.Title,
              sponsorMpId,
              introductionDate,
              status: bill.Status,
              summary: bill.Summary,
            })
          }

          return {
            success: true,
            data: billData,
          }
        }

        throw new Error('Playwright fallback: Unable to extract bill data from page')
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

  protected validateData(data: BillData[]): { isValid: boolean; anomalies: string[] } {
    const anomalies: string[] = []

    // Check for required fields
    const missingFields = data.filter((bill) => !bill.billNumber || !bill.title)
    if (missingFields.length > 0) {
      anomalies.push(`${missingFields.length} bills with missing required fields`)
    }

    // Check for duplicate bill numbers
    const billNumbers = new Set<string>()
    const duplicates: BillData[] = []
    for (const bill of data) {
      if (billNumbers.has(bill.billNumber)) {
        duplicates.push(bill)
      }
      billNumbers.add(bill.billNumber)
    }
    if (duplicates.length > 0) {
      anomalies.push(`${duplicates.length} duplicate bill numbers detected`)
    }

    // Check for future dates
    const now = new Date()
    const futureBills = data.filter(
      (bill) => bill.introductionDate && bill.introductionDate > now
    )
    if (futureBills.length > 0) {
      anomalies.push(`${futureBills.length} bills with future introduction dates`)
    }

    return {
      isValid: anomalies.length === 0,
      anomalies,
    }
  }

  protected async saveToDatabase(data: BillData[]): Promise<void> {
    this.logInfo(`Saving ${data.length} bills to database...`)

    for (const bill of data) {
      try {
        // Check if bill already exists
        const existing = await db
          .select()
          .from(bills)
          .where(eq(bills.billNumber, bill.billNumber))
          .limit(1)

        if (existing.length === 0) {
          await db.insert(bills).values({
            billNumber: bill.billNumber,
            title: bill.title,
            sponsorMpId: bill.sponsorMpId,
            introductionDate: bill.introductionDate,
            status: bill.status,
            summary: bill.summary,
          })
        } else {
          // Update existing bill
          await db
            .update(bills)
            .set({
              title: bill.title,
              sponsorMpId: bill.sponsorMpId,
              introductionDate: bill.introductionDate,
              status: bill.status,
              summary: bill.summary,
              updatedAt: new Date(),
            })
            .where(eq(bills.billNumber, bill.billNumber))
        }
      } catch (error) {
        this.logError(`Failed to save bill ${bill.billNumber}:`, error)
      }
    }

    this.logInfo('Bills saved successfully')
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

