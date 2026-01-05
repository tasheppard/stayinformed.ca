import { parseString } from 'xml2js'
import { promisify } from 'util'
import { BaseScraper, ScraperResult } from './base-scraper'
import { db } from '../db'
import { petitions, mps } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import type { Browser, Page } from 'playwright'

const parseXML = promisify(parseString)

interface PetitionData {
  petitionNumber: string
  title: string
  sponsorMpId?: number
  presentedDate?: Date
  status?: string
  signatureCount?: number
}

interface PetitionsXMLResponse {
  Petitions?: {
    Petition?: Array<{
      PetitionNumber?: Array<{ _?: string }>
      Title?: Array<{ _?: string }>
      Sponsor?: Array<{
        PersonId?: Array<{ _?: string }>
        PersonOfficialFirstName?: Array<{ _?: string }>
        PersonOfficialLastName?: Array<{ _?: string }>
      }>
      PresentedDate?: Array<{ _?: string }>
      Status?: Array<{ _?: string }>
      SignatureCount?: Array<{ _?: string }>
    }>
  }
}

/**
 * Scraper for petitions from ourcommons.ca/Petitions (XML)
 */
export class PetitionsScraper extends BaseScraper<PetitionData> {
  private readonly baseUrl = 'https://www.ourcommons.ca/Petitions'

  protected getSourceUrl(): string {
    return this.baseUrl
  }

  protected async scrapeXML(): Promise<ScraperResult<PetitionData[]>> {
    try {
      this.logInfo('Fetching petitions XML...')

      const response = await fetch(this.baseUrl, {
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const xmlText = await response.text()
      const parsed = (await parseXML(xmlText)) as PetitionsXMLResponse

      if (!parsed.Petitions?.Petition) {
        return {
          success: false,
          error: 'No petitions found in XML response',
        }
      }

      const petitionData: PetitionData[] = []
      const mpPersonIdMap = await this.getMPPersonIdMap()
      const mpNameMap = await this.getMPNameMap() // Fallback for backward compatibility

      for (const petition of parsed.Petitions.Petition) {
        const petitionNumber = petition.PetitionNumber?.[0]?._ || ''
        const title = petition.Title?.[0]?._ || ''
        const personId = petition.Sponsor?.[0]?.PersonId?.[0]?._ || ''
        const firstName = petition.Sponsor?.[0]?.PersonOfficialFirstName?.[0]?._ || ''
        const lastName = petition.Sponsor?.[0]?.PersonOfficialLastName?.[0]?._ || ''
        const presentedDateStr = petition.PresentedDate?.[0]?._ || ''
        const status = petition.Status?.[0]?._ || undefined
        const signatureCountStr = petition.SignatureCount?.[0]?._ || ''

        if (!petitionNumber || !title) {
          this.logWarning('Skipping petition with missing required fields')
          continue
        }

        let sponsorMpId: number | undefined
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

        const presentedDate = presentedDateStr ? new Date(presentedDateStr) : undefined
        const signatureCount = signatureCountStr ? parseInt(signatureCountStr, 10) : undefined

        petitionData.push({
          petitionNumber,
          title,
          sponsorMpId,
          presentedDate,
          status,
          signatureCount,
        })
      }

      this.logInfo(`Scraped ${petitionData.length} petitions`)
      return {
        success: true,
        data: petitionData,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected async scrapeWithPlaywright(): Promise<ScraperResult<PetitionData[]>> {
    try {
      this.logInfo('Scraping petitions with Playwright...')
      const browser = await this.getBrowser()
      const page = await browser.newPage()

      try {
        await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: this.timeout })

        // Wait for XML content to load
        await page.waitForSelector('body', { timeout: this.timeout })

        const xmlContent = await page.content()
        const parsed = (await parseXML(xmlContent)) as PetitionsXMLResponse

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

  protected validateData(data: PetitionData[]): { isValid: boolean; anomalies: string[] } {
    const anomalies: string[] = []

    // Check for required fields
    const missingFields = data.filter((petition) => !petition.petitionNumber || !petition.title)
    if (missingFields.length > 0) {
      anomalies.push(`${missingFields.length} petitions with missing required fields`)
    }

    // Check for duplicate petition numbers
    const petitionNumbers = new Set<string>()
    const duplicates: PetitionData[] = []
    for (const petition of data) {
      if (petitionNumbers.has(petition.petitionNumber)) {
        duplicates.push(petition)
      }
      petitionNumbers.add(petition.petitionNumber)
    }
    if (duplicates.length > 0) {
      anomalies.push(`${duplicates.length} duplicate petition numbers detected`)
    }

    // Check for future dates
    const now = new Date()
    const futurePetitions = data.filter(
      (petition) => petition.presentedDate && petition.presentedDate > now
    )
    if (futurePetitions.length > 0) {
      anomalies.push(`${futurePetitions.length} petitions with future presentation dates`)
    }

    // Check for negative signature counts
    const negativeSignatures = data.filter(
      (petition) => petition.signatureCount !== undefined && petition.signatureCount < 0
    )
    if (negativeSignatures.length > 0) {
      anomalies.push(`${negativeSignatures.length} petitions with negative signature counts`)
    }

    return {
      isValid: anomalies.length === 0,
      anomalies,
    }
  }

  protected async saveToDatabase(data: PetitionData[]): Promise<void> {
    this.logInfo(`Saving ${data.length} petitions to database...`)

    for (const petition of data) {
      try {
        // Check if petition already exists
        const existing = await db
          .select()
          .from(petitions)
          .where(eq(petitions.petitionNumber, petition.petitionNumber))
          .limit(1)

        if (existing.length === 0) {
          await db.insert(petitions).values({
            petitionNumber: petition.petitionNumber,
            title: petition.title,
            sponsorMpId: petition.sponsorMpId,
            presentedDate: petition.presentedDate,
            status: petition.status,
            signatureCount: petition.signatureCount,
          })
        } else {
          // Update existing petition
          await db
            .update(petitions)
            .set({
              title: petition.title,
              sponsorMpId: petition.sponsorMpId,
              presentedDate: petition.presentedDate,
              status: petition.status,
              signatureCount: petition.signatureCount,
              updatedAt: new Date(),
            })
            .where(eq(petitions.petitionNumber, petition.petitionNumber))
        }
      } catch (error) {
        this.logError(`Failed to save petition ${petition.petitionNumber}:`, error)
      }
    }

    this.logInfo('Petitions saved successfully')
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

