import { parseString } from 'xml2js'
import { promisify } from 'util'
import { BaseScraper, ScraperResult } from './base-scraper'
import { db } from '../db'
import { mps } from '../db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import type { Browser, Page } from 'playwright'
import {
  sanitizeName,
  sanitizeConstituencyName,
  sanitizeCaucusName,
  smartMergeText,
} from '../utils/data-sanitization'

// Configure xml2js to parse text content correctly
// charkey: '_' tells xml2js to store text content in the '_' property when there are attributes
// Without attributes, text is stored directly as a string in the array
const parseXML = promisify((xml: string, callback: (err: Error | null, result: unknown) => void) => {
  parseString(xml, { 
    explicitArray: true, // Always return arrays
    mergeAttrs: false,   // Don't merge attributes
    explicitRoot: true,  // Keep root element
    charkey: '_',        // Store text content in '_' property (default is '#text')
  }, callback)
})

interface MPListData {
  personId: string
  firstName: string
  lastName: string
  fullName: string
  constituencyName: string
  province: string
  caucusShortName?: string
  fromDateTime?: Date
  toDateTime?: Date
}

interface MPXMLData {
  PersonId?: Array<{ _?: string }>
  PersonOfficialFirstName?: Array<{ _?: string }>
  PersonOfficialLastName?: Array<{ _?: string }>
  ConstituencyName?: Array<{ _?: string }>
  ConstituencyProvinceTerritoryName?: Array<{ _?: string }>
  CaucusShortName?: Array<{ _?: string }>
  FromDateTime?: Array<{ _?: string }>
  ToDateTime?: Array<{ _?: string }>
}

interface MPsXMLResponse {
  ArrayOfMemberOfParliament?: {
    MemberOfParliament?: Array<MPXMLData>
  }
}

/**
 * Scraper for MP list from ourcommons.ca/Members/en/search/XML
 * Fetches and updates the list of all 338 MPs
 */
export class MPListScraper extends BaseScraper<MPListData> {
  private readonly baseUrl = 'https://www.ourcommons.ca/Members/en/search/XML'

  protected getSourceUrl(): string {
    return this.baseUrl
  }

  protected async scrapeXML(): Promise<ScraperResult<MPListData[]>> {
    try {
      this.logInfo('Fetching MP list XML...')

      const response = await fetch(this.baseUrl, {
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const xmlText = await response.text()
      const parsed = (await parseXML(xmlText)) as MPsXMLResponse

      if (!parsed.ArrayOfMemberOfParliament?.MemberOfParliament) {
        return {
          success: false,
          error: 'No MPs found in XML response',
        }
      }

      const xmlMPs = parsed.ArrayOfMemberOfParliament.MemberOfParliament
      const mpListData: MPListData[] = []

      // Check for dry run mode
      const isDryRun = process.env.MP_SCRAPER_DRY_RUN === 'true'
      const maxMPs = isDryRun ? 5 : xmlMPs.length

      this.logInfo(
        `Processing ${isDryRun ? `first ${maxMPs} of ` : ''}${xmlMPs.length} MPs from XML`
      )

      for (let i = 0; i < maxMPs && i < xmlMPs.length; i++) {
        const xmlMP = xmlMPs[i]

        // Extract text content - xml2js stores text content based on configuration:
        // - Direct string in array when no attributes (with explicitArray: true)
        // - Object with '_' property when charsKey is set to '_' and there are attributes
        // - Object with '#text' property when using default charsKey and there are attributes
        const getText = (field: any): string => {
          if (!field || !Array.isArray(field) || field.length === 0) return ''
          const value = field[0]
          if (typeof value === 'string') return value
          if (value && typeof value === 'object') {
            // Check for '_' property (with charsKey: '_' config and attributes)
            if (value._ !== undefined && value._ !== null) return String(value._)
            // Check for '#text' property (default xml2js behavior with attributes)
            if ((value as any)['#text'] !== undefined && (value as any)['#text'] !== null) {
              return String((value as any)['#text'])
            }
            // Check for '$t' property (some xml2js configs)
            if (value.$t !== undefined && value.$t !== null) return String(value.$t)
            // If object has no text properties, it's an empty object - return empty string
            // Avoid String({}) which would return "[object Object]"
            return ''
          }
          return String(value || '')
        }

        const personId = getText(xmlMP.PersonId)
        const firstName = getText(xmlMP.PersonOfficialFirstName)
        const lastName = getText(xmlMP.PersonOfficialLastName)
        const constituencyName = getText(xmlMP.ConstituencyName)
        const province = getText(xmlMP.ConstituencyProvinceTerritoryName)
        const caucusShortName = getText(xmlMP.CaucusShortName) || undefined
        const fromDateTimeStr = getText(xmlMP.FromDateTime) || undefined
        const toDateTimeStr = getText(xmlMP.ToDateTime) || undefined

        // Validate required fields
        if (!personId || !firstName || !lastName || !constituencyName || !province) {
          this.logWarning(
            `Skipping MP with missing required fields: ${firstName} ${lastName} (PersonId: ${personId || 'missing'})`
          )
          continue
        }

        const fullName = `${firstName} ${lastName}`.trim()

        // Parse dates
        let fromDateTime: Date | undefined
        let toDateTime: Date | undefined

        if (fromDateTimeStr) {
          fromDateTime = new Date(fromDateTimeStr)
          if (isNaN(fromDateTime.getTime())) {
            this.logWarning(`Invalid FromDateTime for ${fullName}: ${fromDateTimeStr}`)
            fromDateTime = undefined
          }
        }

        if (toDateTimeStr) {
          toDateTime = new Date(toDateTimeStr)
          if (isNaN(toDateTime.getTime())) {
            this.logWarning(`Invalid ToDateTime for ${fullName}: ${toDateTimeStr}`)
            toDateTime = undefined
          }
        }

        mpListData.push({
          personId,
          firstName,
          lastName,
          fullName,
          constituencyName,
          province,
          caucusShortName,
          fromDateTime,
          toDateTime,
        })
      }

      this.logInfo(`Successfully parsed ${mpListData.length} MPs from XML`)
      return {
        success: true,
        data: mpListData,
      }
    } catch (error) {
      this.logError('Failed to scrape MP list XML:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected async scrapeWithPlaywright(): Promise<ScraperResult<MPListData[]>> {
    try {
      this.logInfo('Scraping MP list with Playwright (fallback)...')
      const browser = await this.getBrowser()
      const page = await browser.newPage()

      try {
        await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: this.timeout })

        // Wait for XML content to load
        await page.waitForSelector('body', { timeout: this.timeout })

        const xmlContent = await page.content()

        // Try to extract XML from the page
        // The XML might be in a <pre> tag or directly in the body
        const xmlText = await page.evaluate(() => {
          const pre = document.querySelector('pre')
          if (pre) return pre.textContent || ''
          return document.body.textContent || ''
        })

        if (xmlText) {
          const parsed = (await parseXML(xmlText)) as MPsXMLResponse
          // Reuse XML parsing logic
          const xmlResult = await this.scrapeXML()
          if (xmlResult.success) {
            return xmlResult
          }
        }

        throw new Error('Playwright fallback: Unable to extract XML from page')
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

  protected validateData(data: MPListData[]): { isValid: boolean; anomalies: string[] } {
    const anomalies: string[] = []

    // Check for required fields
    const missingFields = data.filter(
      (mp) =>
        !mp.personId ||
        !mp.firstName ||
        !mp.lastName ||
        !mp.constituencyName ||
        !mp.province
    )
    if (missingFields.length > 0) {
      anomalies.push(`${missingFields.length} MPs with missing required fields`)
    }

    // Check for duplicate PersonIds
    const personIds = new Set<string>()
    const duplicates: MPListData[] = []
    for (const mp of data) {
      if (personIds.has(mp.personId)) {
        duplicates.push(mp)
      }
      personIds.add(mp.personId)
    }
    if (duplicates.length > 0) {
      anomalies.push(`${duplicates.length} duplicate PersonIds detected`)
    }

    // Check for invalid dates
    const invalidDates: MPListData[] = []
    for (const mp of data) {
      if (mp.fromDateTime && isNaN(mp.fromDateTime.getTime())) {
        invalidDates.push(mp)
      }
      if (mp.toDateTime && isNaN(mp.toDateTime.getTime())) {
        invalidDates.push(mp)
      }
    }
    if (invalidDates.length > 0) {
      anomalies.push(`${invalidDates.length} MPs with invalid dates`)
    }

    return {
      isValid: anomalies.length === 0,
      anomalies,
    }
  }

  protected async saveToDatabase(data: MPListData[]): Promise<void> {
    this.logInfo(`Saving ${data.length} MPs to database...`)

    let insertedCount = 0
    let updatedCount = 0

    // Get all PersonIds from the XML data
    const xmlPersonIds = data.map((mp) => mp.personId)

    // Process each MP from XML
    for (const mpData of data) {
      try {
        // Sanitize and title case all text fields
        const sanitizedFirstName = sanitizeName(mpData.firstName)
        const sanitizedLastName = sanitizeName(mpData.lastName)
        const sanitizedFullName = sanitizeName(mpData.fullName)
        const sanitizedConstituency = sanitizeConstituencyName(mpData.constituencyName)
        const sanitizedProvince = sanitizeName(mpData.province)
        const sanitizedCaucus = mpData.caucusShortName
          ? sanitizeCaucusName(mpData.caucusShortName)
          : undefined

        // Generate slug from full name (for SEO URLs)
        // Format: firstname-lastname (lowercase, hyphens for spaces)
        const slug = sanitizedFullName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '')

        // Check if MP with personId exists
        const existingMPs = await db
          .select()
          .from(mps)
          .where(eq(mps.personId, mpData.personId))
          .limit(1)

        if (existingMPs.length > 0) {
          // Update existing MP
          const existing = existingMPs[0]

          // Smart merge: preserve clean existing data when possible
          const mergedFullName = smartMergeText(existing.fullName, sanitizedFullName)
          const mergedConstituency = smartMergeText(
            existing.constituencyName,
            sanitizedConstituency
          )
          const mergedProvince = smartMergeText(existing.province, sanitizedProvince)
          const mergedCaucus = mpData.caucusShortName
            ? smartMergeText(existing.caucusShortName || null, sanitizedCaucus || null)
            : existing.caucusShortName

          await db
            .update(mps)
            .set({
              personId: mpData.personId,
              fullName: mergedFullName,
              constituencyName: mergedConstituency,
              province: mergedProvince,
              caucusShortName: mergedCaucus || undefined,
              isActive: true,
              status: 'active',
              updatedAt: new Date(),
            })
            .where(eq(mps.id, existing.id))

          updatedCount++
        } else {
          // Insert new MP
          await db.insert(mps).values({
            personId: mpData.personId,
            fullName: sanitizedFullName,
            slug,
            constituencyName: sanitizedConstituency,
            province: sanitizedProvince,
            caucusShortName: sanitizedCaucus || undefined,
            isActive: true,
            status: 'active',
          })

          insertedCount++
        }
      } catch (error) {
        this.logError(
          `Failed to save MP ${mpData.fullName} (PersonId: ${mpData.personId}):`,
          error
        )
      }
    }

    // Soft delete logic: Mark MPs as inactive if they're not in the XML list
    this.logInfo('Checking for departed MPs (soft delete)...')

    try {
      // Get all currently active MPs from database
      const activeMPs = await db
        .select({ id: mps.id, personId: mps.personId })
        .from(mps)
        .where(eq(mps.isActive, true))

      // Find MPs that are active in DB but not in XML
      const departedMPs = activeMPs.filter(
        (mp) => mp.personId && !xmlPersonIds.includes(mp.personId)
      )

      if (departedMPs.length > 0) {
        const departedIds = departedMPs.map((mp) => mp.id)

        // Mark as inactive (soft delete)
        await db
          .update(mps)
          .set({
            isActive: false,
            status: 'past',
            updatedAt: new Date(),
          })
          .where(inArray(mps.id, departedIds))

        this.logInfo(`Marked ${departedMPs.length} MPs as inactive (departed)`)
      } else {
        this.logInfo('No departed MPs found')
      }
    } catch (error) {
      this.logError('Failed to process soft delete:', error)
    }

    this.logInfo(
      `MP list saved: ${insertedCount} inserted, ${updatedCount} updated, ${data.length} total processed`
    )
  }
}

