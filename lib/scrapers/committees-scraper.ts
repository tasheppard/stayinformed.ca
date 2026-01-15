import { BaseScraper, ScraperResult } from './base-scraper'
import { db } from '../db'
import { committeeParticipation, mps } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { Browser, Page } from 'playwright'

interface CommitteeData {
  mpId: number
  committeeName: string
  role?: string
  startDate?: Date
  endDate?: Date
  meetingCount: number
}

/**
 * Scraper for committee participation from ourcommons.ca/Committees (HTML)
 */
export class CommitteesScraper extends BaseScraper<CommitteeData> {
  private readonly baseUrl = 'https://www.ourcommons.ca/Committees'

  protected getSourceUrl(): string {
    return this.baseUrl
  }

  protected async scrapeXML(): Promise<ScraperResult<CommitteeData[]>> {
    // Committees are HTML-based, so XML scraping is not applicable
    // We'll use Playwright for this scraper
    return {
      success: false,
      error: 'Committees scraper requires HTML parsing, use Playwright method',
    }
  }

  protected async scrapeWithPlaywright(): Promise<ScraperResult<CommitteeData[]>> {
    try {
      this.logInfo('Scraping committee participation with Playwright...')
      const browser = await this.getBrowser()
      const page = await browser.newPage()

      try {
        await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: this.timeout })

        // Wait for committee listings to load
        await page.waitForSelector('body', { timeout: this.timeout })

        // Extract committee data from HTML
        const committeeData = await page.evaluate(() => {
          const data: Array<CommitteeData & { mpName?: string; personId?: string }> = []
          
          // This is a placeholder - actual implementation depends on the HTML structure
          // You'll need to inspect the actual page structure and adjust selectors accordingly
          const committeeRows = document.querySelectorAll('.committee-row, tr, .committee-item')
          
          // Helper function to extract PersonId from MP detail page links
          // MP detail URLs follow format: /Members/en/FirstName-LastName(PersonId)
          const extractPersonIdFromLink = (link: HTMLAnchorElement | null): string | undefined => {
            if (!link || !link.href) return undefined
            
            const href = link.href
            // Match pattern: /Members/en/FirstName-LastName(PersonId) or similar
            const match = href.match(/\(([A-Za-z0-9]+)\)/)
            if (match && match[1]) {
              return match[1]
            }
            
            // Also check for data attributes that might contain PersonId
            const dataPersonId = link.getAttribute('data-person-id') || 
                                link.getAttribute('data-personid') ||
                                link.getAttribute('data-personId')
            if (dataPersonId) {
              return dataPersonId
            }
            
            return undefined
          }
          
          for (const row of committeeRows) {
            // Extract committee name, MP name, role, dates, etc.
            // This is a simplified example - adjust based on actual HTML structure
            const committeeName = row.querySelector('.committee-name')?.textContent?.trim()
            const mpNameElement = row.querySelector('.mp-name, a[href*="/Members/"]')
            const mpName = mpNameElement?.textContent?.trim() || 
                          row.querySelector('.mp-name')?.textContent?.trim()
            const role = row.querySelector('.role')?.textContent?.trim()
            const startDateStr = row.querySelector('.start-date')?.textContent?.trim()
            const endDateStr = row.querySelector('.end-date')?.textContent?.trim()
            const meetingCountStr = row.querySelector('.meeting-count')?.textContent?.trim()

            if (committeeName && mpName) {
              // Try to extract PersonId from MP link
              const mpLink = row.querySelector('a[href*="/Members/"]') as HTMLAnchorElement | null
              const personId = extractPersonIdFromLink(mpLink)
              
              // Also check for PersonId in data attributes on the row itself
              const rowPersonId = row.getAttribute('data-person-id') || 
                                 row.getAttribute('data-personid') ||
                                 row.getAttribute('data-personId') ||
                                 personId
              
              data.push({
                mpId: 0, // Will be set after matching
                committeeName,
                role: role || undefined,
                startDate: startDateStr ? new Date(startDateStr) : undefined,
                endDate: endDateStr ? new Date(endDateStr) : undefined,
                meetingCount: meetingCountStr ? parseInt(meetingCountStr, 10) : 0,
                // Store MP name and PersonId temporarily for matching
                mpName: mpName,
                personId: rowPersonId || undefined,
              })
            }
          }
          
          return data
        })

        // Match MPs to IDs using PersonId (preferred) or name (fallback)
        const mpPersonIdMap = await this.getMPPersonIdMap()
        const mpNameMap = await this.getMPNameMap() // Fallback for backward compatibility
        const matchedData: CommitteeData[] = []

        for (const item of committeeData as (CommitteeData & { mpName?: string; personId?: string })[]) {
          const mpName = (item as { mpName?: string }).mpName
          const personId = (item as { personId?: string }).personId
          
          if (!mpName && !personId) {
            continue
          }

          // Try PersonId matching first (preferred method)
          let mpId: number | undefined
          if (personId) {
            mpId = mpPersonIdMap.get(personId)
            if (!mpId && mpName) {
              this.logWarning(`MP not found by PersonId: ${personId} (${mpName})`)
            }
          }

          // Fallback to name matching if PersonId not available or not found
          if (!mpId && mpName) {
            mpId = mpNameMap.get(mpName)
            if (!mpId) {
              this.logWarning(`MP not found in database: ${mpName}${personId ? ` (PersonId: ${personId})` : ''}`)
              continue
            }
            // Log when using fallback name matching
            if (personId) {
              this.logWarning(`Using name fallback for PersonId ${personId} (${mpName})`)
            }
          }

          if (mpId) {
            matchedData.push({
              mpId,
              committeeName: item.committeeName,
              role: item.role,
              startDate: item.startDate,
              endDate: item.endDate,
              meetingCount: item.meetingCount,
            })
          }
        }

        this.logInfo(`Scraped ${matchedData.length} committee participations`)
        return {
          success: true,
          data: matchedData,
        }
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

  protected validateData(data: CommitteeData[]): { isValid: boolean; anomalies: string[] } {
    const anomalies: string[] = []

    // Check for required fields
    const missingFields = data.filter(
      (committee) => !committee.mpId || !committee.committeeName
    )
    if (missingFields.length > 0) {
      anomalies.push(`${missingFields.length} committee participations with missing required fields`)
    }

    // Check for end date before start date
    const invalidDates = data.filter(
      (committee) =>
        committee.startDate &&
        committee.endDate &&
        committee.endDate < committee.startDate
    )
    if (invalidDates.length > 0) {
      anomalies.push(`${invalidDates.length} committee participations with invalid date ranges`)
    }

    // Check for negative meeting counts
    const negativeMeetings = data.filter((committee) => committee.meetingCount < 0)
    if (negativeMeetings.length > 0) {
      anomalies.push(`${negativeMeetings.length} committee participations with negative meeting counts`)
    }

    return {
      isValid: anomalies.length === 0,
      anomalies,
    }
  }

  protected async saveToDatabase(data: CommitteeData[]): Promise<void> {
    this.logInfo(`Saving ${data.length} committee participations to database...`)

    for (const committee of data) {
      try {
        // Check if participation already exists
        const existing = await db
          .select()
          .from(committeeParticipation)
          .where(
            and(
              eq(committeeParticipation.mpId, committee.mpId),
              eq(committeeParticipation.committeeName, committee.committeeName)
            )
          )
          .limit(1)

        if (existing.length === 0) {
          await db.insert(committeeParticipation).values({
            mpId: committee.mpId,
            committeeName: committee.committeeName,
            role: committee.role,
            startDate: committee.startDate,
            endDate: committee.endDate,
            meetingCount: committee.meetingCount,
          })
        } else {
          // Update existing participation
          await db
            .update(committeeParticipation)
            .set({
              role: committee.role,
              startDate: committee.startDate,
              endDate: committee.endDate,
              meetingCount: committee.meetingCount,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(committeeParticipation.mpId, committee.mpId),
                eq(committeeParticipation.committeeName, committee.committeeName)
              )
            )
        }
      } catch (error) {
        this.logError(
          `Failed to save committee participation for MP ${committee.mpId}, committee ${committee.committeeName}:`,
          error
        )
      }
    }

    this.logInfo('Committee participations saved successfully')
  }

  /**
   * Get a map of MP PersonIds to their database IDs
   * This is the preferred method for matching MPs
   * Note: Committee data is primarily sourced from MPDetailScraper XML,
   * which already saves committee participation using PersonId matching.
   * This scraper serves as a fallback for HTML-based scraping.
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

