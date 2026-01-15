import { parseString } from 'xml2js'
import { promisify } from 'util'
import { BaseScraper, ScraperResult } from './base-scraper'
import { db } from '../db'
import { mps, committeeParticipation } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import type { Browser, Page } from 'playwright'
import { generateMpUrlSlug } from '../utils/mp-url-helper'
import {
  sanitizeName,
  sanitizeConstituencyName,
  sanitizeCaucusName,
  smartMergeText,
} from '../utils/data-sanitization'

// Configure xml2js to parse text content correctly
const parseXML = promisify((xml: string, callback: (err: Error | null, result: unknown) => void) => {
  parseString(xml, { 
    explicitArray: true,
    mergeAttrs: false,
    explicitRoot: true,
    charkey: '_',
  }, callback)
})

interface MPDetailData {
  personId: string
  // Basic Info
  personShortHonorific?: string
  firstName: string
  lastName: string
  fullName: string
  constituencyName: string
  province: string
  caucusShortName?: string
  fromDateTime?: Date
  toDateTime?: Date
  parliamentNumber?: number
  sessionNumber?: number
  affiliationRoleName?: string
  // Committee Member Roles
  committeeRoles?: CommitteeRole[]
  // Parliamentary Position Roles
  parliamentaryPositions?: ParliamentaryPosition[]
  // Caucus Member Roles
  caucusRoles?: CaucusRole[]
  // Election Candidate Roles
  electionCandidateRoles?: ElectionCandidateRole[]
  // Photo
  photoUrl?: string
}

interface CommitteeRole {
  parliamentNumber?: number
  sessionNumber?: number
  affiliationRoleName?: string
  committeeName: string
  fromDateTime?: Date
  toDateTime?: Date
}

interface ParliamentaryPosition {
  parliamentaryPositionRole?: string
  title?: string
  fromDateTime?: Date
  toDateTime?: Date
}

interface CaucusRole {
  caucusMemberRole?: string
  caucusShortName?: string
  fromDateTime?: Date
  toDateTime?: Date
  parliamentNumber?: number
}

interface ElectionCandidateRole {
  electionCandidateRole?: string
  electionEventTypeName?: string
  toDateTime?: Date
  constituencyName?: string
  constituencyProvinceTerritoryName?: string
  politicalPartyName?: string
  resolvedElectionResultTypeName?: string
}

/**
 * Scraper for detailed MP information from individual MP XML endpoints
 * Fetches detailed data including committees, parliamentary positions, etc.
 */
export class MPDetailScraper extends BaseScraper<MPDetailData> {
  private readonly baseUrl = 'http://www.ourcommons.ca/Members/en'

  protected getSourceUrl(): string {
    return this.baseUrl
  }

  /**
   * Generate MP URL slug using utility function
   */
  private generateMpUrlSlug(firstName: string, lastName: string, personId: string): string {
    return generateMpUrlSlug(firstName, lastName, personId)
  }

  protected async scrapeXML(): Promise<ScraperResult<MPDetailData[]>> {
    try {
      // Get all active MPs from database
      const activeMPs = await db
        .select({
          id: mps.id,
          personId: mps.personId,
          fullName: mps.fullName,
        })
        .from(mps)
        .where(eq(mps.isActive, true))

      if (activeMPs.length === 0) {
        this.logInfo('No active MPs found in database')
        return {
          success: true,
          data: [],
        }
      }

      // Check for dry run mode
      const isDryRun = process.env.MP_SCRAPER_DRY_RUN === 'true'
      const maxMPs = isDryRun ? 5 : activeMPs.length

      this.logInfo(
        `Processing ${isDryRun ? `first ${maxMPs} of ` : ''}${activeMPs.length} active MPs`
      )

      const mpDetailData: MPDetailData[] = []
      const failedMPs: Array<{ mp: typeof activeMPs[0]; error: string }> = []

      for (let i = 0; i < maxMPs && i < activeMPs.length; i++) {
        const mp = activeMPs[i]

        if (!mp.personId) {
          this.logWarning(`Skipping MP ${mp.fullName} (ID: ${mp.id}) - missing personId`)
          continue
        }

        // Extract first and last name from fullName for URL generation
        // Note: fullName is stored as "FirstName LastName" from MPListScraper
        // We need to split carefully to handle names like "Jean-Yves Blanchet"
        const nameParts = mp.fullName.trim().split(/\s+/)
        if (nameParts.length < 2) {
          this.logWarning(`Skipping MP ${mp.fullName} (PersonId: ${mp.personId}) - cannot parse name (need at least first and last name)`)
          continue
        }
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(' ')

        // Generate URL slug
        const urlSlug = this.generateMpUrlSlug(firstName, lastName, mp.personId)
        const xmlUrl = `${this.baseUrl}/${urlSlug}/XML`

        // Rate limiting: 1 request per second (apply once per MP, before retry loop)
        // This ensures we don't exceed 1 request per second between different MPs
        if (i > 0) {
          await this.delay(1000)
        }

        // Try to fetch XML with retry logic
        // Specification: Retry up to 3 times with exponential backoff: 1s, 2s, 4s delays
        // This means: attempt 1 → wait 1s → attempt 2 → wait 2s → attempt 3 → wait 4s → attempt 4 (final)
        // Total: 4 attempts (initial + 3 retries)
        let xmlResult: ScraperResult<MPDetailData> | null = null
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const response = await fetch(xmlUrl, {
              signal: AbortSignal.timeout(this.timeout),
            })

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const xmlText = await response.text()
            xmlResult = await this.parseMPDetailXML(xmlText, mp.personId, firstName, lastName)

            if (xmlResult.success) {
              break // Success, exit retry loop
            } else {
              // Parsing failed (invalid XML structure, missing data, etc.)
              lastError = new Error(xmlResult.error || 'Unknown error')
              this.logError(`Attempt ${attempt} failed for ${mp.fullName} (${xmlUrl}):`, lastError)

              // Apply exponential backoff: 1s, 2s, 4s delays
              // After attempt 1: wait 1s (2^0 * 1000)
              // After attempt 2: wait 2s (2^1 * 1000)
              // After attempt 3: wait 4s (2^2 * 1000)
              // After attempt 4: no wait (final attempt, will fallback to HTML)
              if (attempt < 4) {
                const backoffDelay = Math.pow(2, attempt - 1) * 1000
                await this.delay(backoffDelay)
              }
            }
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))
            this.logError(`Attempt ${attempt} failed for ${mp.fullName} (${xmlUrl}):`, error)

            // Exponential backoff: 1s, 2s, 4s delays
            // After attempt 1: wait 1s (2^0 * 1000)
            // After attempt 2: wait 2s (2^1 * 1000)
            // After attempt 3: wait 4s (2^2 * 1000)
            // After attempt 4: no wait (final attempt, will fallback to HTML)
            if (attempt < 4) {
              const backoffDelay = Math.pow(2, attempt - 1) * 1000
              await this.delay(backoffDelay)
            }
          }
        }

        if (xmlResult && xmlResult.success && xmlResult.data) {
          mpDetailData.push(xmlResult.data)
        } else {
          // After 4 failed attempts (1 initial + 3 retries), log for fallback to HTML scraping
          failedMPs.push({
            mp,
            error: lastError?.message || 'Unknown error',
          })
          this.logWarning(
            `Failed to fetch XML for ${mp.fullName} (PersonId: ${mp.personId}) after 4 attempts. Will try HTML fallback.`
          )
        }

        // Log progress every 50 MPs
        if ((i + 1) % 50 === 0) {
          this.logInfo(`Processed ${i + 1}/${activeMPs.length} MPs`)
        }
      }

      // Try HTML fallback for failed MPs
      if (failedMPs.length > 0 && this.usePlaywright) {
        this.logInfo(`Attempting HTML fallback for ${failedMPs.length} failed MPs`)
        for (const { mp } of failedMPs) {
          // Skip MPs without personId as Playwright scraper requires it
          if (!mp.personId) {
            this.logInfo(`Skipping ${mp.fullName} - no personId available`)
            continue
          }
          try {
            const htmlResult = await this.scrapeWithPlaywrightForMP({
              id: mp.id,
              personId: mp.personId,
              fullName: mp.fullName,
            })
            if (htmlResult.success && htmlResult.data) {
              mpDetailData.push(htmlResult.data)
            }
          } catch (error) {
            this.logError(`HTML fallback also failed for ${mp.fullName}:`, error)
          }
        }
      }

      this.logInfo(`Successfully parsed ${mpDetailData.length} MP details`)
      return {
        success: true,
        data: mpDetailData,
      }
    } catch (error) {
      this.logError('Failed to scrape MP details:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Parse MP detail XML into MPDetailData
   */
  private async parseMPDetailXML(
    xmlText: string,
    personId: string,
    firstName: string,
    lastName: string
  ): Promise<ScraperResult<MPDetailData>> {
    try {
      const parsed = await parseXML(xmlText) as any

      // Extract text helper (same as MPListScraper)
      const getText = (field: any): string => {
        if (!field || !Array.isArray(field) || field.length === 0) return ''
        const value = field[0]
        if (typeof value === 'string') return value
        if (value && typeof value === 'object') {
          if (value._ !== undefined && value._ !== null) return String(value._)
          if ((value as any)['#text'] !== undefined && (value as any)['#text'] !== null) {
            return String((value as any)['#text'])
          }
          if (value.$t !== undefined && value.$t !== null) return String(value.$t)
          return ''
        }
        return String(value || '')
      }

      // Extract basic info
      const memberData = parsed.MemberOfParliament || parsed.ArrayOfMemberOfParliament?.MemberOfParliament?.[0]
      if (!memberData) {
        return {
          success: false,
          error: 'No MemberOfParliament data found in XML',
        }
      }

      const personShortHonorific = getText(memberData.PersonShortHonorific)
      const constituencyName = getText(memberData.ConstituencyName)
      const province = getText(memberData.ConstituencyProvinceTerritoryName)
      const caucusShortName = getText(memberData.CaucusShortName)
      const fromDateTimeStr = getText(memberData.FromDateTime)
      const toDateTimeStr = getText(memberData.ToDateTime)
      const parliamentNumberStr = getText(memberData.ParliamentNumber)
      const sessionNumberStr = getText(memberData.SessionNumber)
      const affiliationRoleName = getText(memberData.AffiliationRoleName)

      // Parse dates
      let fromDateTime: Date | undefined
      let toDateTime: Date | undefined
      if (fromDateTimeStr) {
        fromDateTime = new Date(fromDateTimeStr)
        if (isNaN(fromDateTime.getTime())) fromDateTime = undefined
      }
      if (toDateTimeStr) {
        toDateTime = new Date(toDateTimeStr)
        if (isNaN(toDateTime.getTime())) toDateTime = undefined
      }

      // Parse numbers
      const parliamentNumber = parliamentNumberStr ? parseInt(parliamentNumberStr, 10) : undefined
      const sessionNumber = sessionNumberStr ? parseInt(sessionNumberStr, 10) : undefined

      // Extract committee roles
      const committeeRoles: CommitteeRole[] = []
      const committeeMemberRoles = memberData.CommitteeMemberRole || []
      for (const role of Array.isArray(committeeMemberRoles) ? committeeMemberRoles : [committeeMemberRoles]) {
        if (!role) continue
        
        // Validate committee name - skip roles without committee names
        const committeeName = getText(role.CommitteeName)
        if (!committeeName || committeeName.trim() === '') {
          continue // Skip roles with empty or missing committee names
        }
        
        // Parse dates with validation (same pattern as basic info)
        const roleFromDateTimeStr = getText(role.FromDateTime)
        const roleToDateTimeStr = getText(role.ToDateTime)
        let roleFromDateTime: Date | undefined
        let roleToDateTime: Date | undefined
        if (roleFromDateTimeStr) {
          roleFromDateTime = new Date(roleFromDateTimeStr)
          if (isNaN(roleFromDateTime.getTime())) roleFromDateTime = undefined
        }
        if (roleToDateTimeStr) {
          roleToDateTime = new Date(roleToDateTimeStr)
          if (isNaN(roleToDateTime.getTime())) roleToDateTime = undefined
        }
        
        committeeRoles.push({
          parliamentNumber: getText(role.ParliamentNumber) ? parseInt(getText(role.ParliamentNumber), 10) : undefined,
          sessionNumber: getText(role.SessionNumber) ? parseInt(getText(role.SessionNumber), 10) : undefined,
          affiliationRoleName: getText(role.AffiliationRoleName),
          committeeName: committeeName,
          fromDateTime: roleFromDateTime,
          toDateTime: roleToDateTime,
        })
      }

      // Extract parliamentary positions
      const parliamentaryPositions: ParliamentaryPosition[] = []
      const positions = memberData.ParliamentaryPositionRole || []
      for (const position of Array.isArray(positions) ? positions : [positions]) {
        if (!position) continue
        
        // Parse dates with validation (same pattern as basic info)
        const positionFromDateTimeStr = getText(position.FromDateTime)
        const positionToDateTimeStr = getText(position.ToDateTime)
        let positionFromDateTime: Date | undefined
        let positionToDateTime: Date | undefined
        if (positionFromDateTimeStr) {
          positionFromDateTime = new Date(positionFromDateTimeStr)
          if (isNaN(positionFromDateTime.getTime())) positionFromDateTime = undefined
        }
        if (positionToDateTimeStr) {
          positionToDateTime = new Date(positionToDateTimeStr)
          if (isNaN(positionToDateTime.getTime())) positionToDateTime = undefined
        }
        
        parliamentaryPositions.push({
          parliamentaryPositionRole: getText(position.ParliamentaryPositionRole),
          title: getText(position.Title),
          fromDateTime: positionFromDateTime,
          toDateTime: positionToDateTime,
        })
      }

      // Extract caucus roles
      const caucusRoles: CaucusRole[] = []
      const caucusMemberRoles = memberData.CaucusMemberRole || []
      for (const role of Array.isArray(caucusMemberRoles) ? caucusMemberRoles : [caucusMemberRoles]) {
        if (!role) continue
        
        // Parse dates with validation (same pattern as basic info)
        const caucusFromDateTimeStr = getText(role.FromDateTime)
        const caucusToDateTimeStr = getText(role.ToDateTime)
        let caucusFromDateTime: Date | undefined
        let caucusToDateTime: Date | undefined
        if (caucusFromDateTimeStr) {
          caucusFromDateTime = new Date(caucusFromDateTimeStr)
          if (isNaN(caucusFromDateTime.getTime())) caucusFromDateTime = undefined
        }
        if (caucusToDateTimeStr) {
          caucusToDateTime = new Date(caucusToDateTimeStr)
          if (isNaN(caucusToDateTime.getTime())) caucusToDateTime = undefined
        }
        
        caucusRoles.push({
          caucusMemberRole: getText(role.CaucusMemberRole),
          caucusShortName: getText(role.CaucusShortName),
          fromDateTime: caucusFromDateTime,
          toDateTime: caucusToDateTime,
          parliamentNumber: getText(role.ParliamentNumber) ? parseInt(getText(role.ParliamentNumber), 10) : undefined,
        })
      }

      // Extract election candidate roles
      const electionCandidateRoles: ElectionCandidateRole[] = []
      const candidateRoles = memberData.ElectionCandidateRole || []
      for (const role of Array.isArray(candidateRoles) ? candidateRoles : [candidateRoles]) {
        if (!role) continue
        
        // Parse dates with validation (same pattern as basic info)
        const candidateToDateTimeStr = getText(role.ToDateTime)
        let candidateToDateTime: Date | undefined
        if (candidateToDateTimeStr) {
          candidateToDateTime = new Date(candidateToDateTimeStr)
          if (isNaN(candidateToDateTime.getTime())) candidateToDateTime = undefined
        }
        
        electionCandidateRoles.push({
          electionCandidateRole: getText(role.ElectionCandidateRole),
          electionEventTypeName: getText(role.ElectionEventTypeName),
          toDateTime: candidateToDateTime,
          constituencyName: getText(role.ConstituencyName),
          constituencyProvinceTerritoryName: getText(role.ConstituencyProvinceTerritoryName),
          politicalPartyName: getText(role.PoliticalPartyName),
          resolvedElectionResultTypeName: getText(role.ResolvedElectionResultTypeName),
        })
      }

      // Extract photo URL if available
      const photoUrl = getText(memberData.PhotoUrl) || undefined

      const fullName = `${firstName} ${lastName}`.trim()

      return {
        success: true,
        data: {
          personId,
          personShortHonorific: personShortHonorific || undefined,
          firstName,
          lastName,
          fullName,
          constituencyName,
          province,
          caucusShortName: caucusShortName || undefined,
          fromDateTime,
          toDateTime,
          parliamentNumber,
          sessionNumber,
          affiliationRoleName: affiliationRoleName || undefined,
          committeeRoles: committeeRoles.length > 0 ? committeeRoles : undefined,
          parliamentaryPositions: parliamentaryPositions.length > 0 ? parliamentaryPositions : undefined,
          caucusRoles: caucusRoles.length > 0 ? caucusRoles : undefined,
          electionCandidateRoles: electionCandidateRoles.length > 0 ? electionCandidateRoles : undefined,
          photoUrl,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected async scrapeWithPlaywright(): Promise<ScraperResult<MPDetailData[]>> {
    // This is a fallback method - for now, return empty result
    // HTML scraping will be implemented per-MP in scrapeXML() when XML fails
    return {
      success: false,
      error: 'Playwright fallback not implemented for bulk scraping',
    }
  }

  /**
   * Scrape a single MP using Playwright (fallback when XML fails)
   */
  private async scrapeWithPlaywrightForMP(mp: { id: number; personId: string; fullName: string }): Promise<ScraperResult<MPDetailData>> {
    try {
      this.logInfo(`Scraping ${mp.fullName} with Playwright (fallback)...`)
      const browser = await this.getBrowser()
      const page = await browser.newPage()

      try {
        // Extract name parts
        const nameParts = mp.fullName.trim().split(/\s+/)
        if (nameParts.length < 2) {
          throw new Error('Cannot parse name for URL generation (need at least first and last name)')
        }
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(' ')

        const urlSlug = this.generateMpUrlSlug(firstName, lastName, mp.personId)
        const htmlUrl = `${this.baseUrl}/${urlSlug}`

        await page.goto(htmlUrl, { waitUntil: 'networkidle', timeout: this.timeout })

        // TODO: Implement HTML parsing for MP details
        // For now, return error
        throw new Error('HTML parsing not yet implemented')
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

  protected validateData(data: MPDetailData[]): { isValid: boolean; anomalies: string[] } {
    const anomalies: string[] = []

    // Check for required fields
    const missingFields = data.filter(
      (mp) => !mp.personId || !mp.firstName || !mp.lastName || !mp.constituencyName || !mp.province
    )
    if (missingFields.length > 0) {
      anomalies.push(`${missingFields.length} MPs with missing required fields`)
    }

    // Check for invalid dates in committee roles
    const invalidDates: string[] = []
    for (const mp of data) {
      if (mp.committeeRoles) {
        for (const role of mp.committeeRoles) {
          if (role.fromDateTime && isNaN(role.fromDateTime.getTime())) {
            invalidDates.push(`${mp.fullName} - committee role invalid fromDateTime`)
          }
          if (role.toDateTime && isNaN(role.toDateTime.getTime())) {
            invalidDates.push(`${mp.fullName} - committee role invalid toDateTime`)
          }
        }
      }
    }
    if (invalidDates.length > 0) {
      anomalies.push(`${invalidDates.length} invalid dates in committee roles`)
    }

    return {
      isValid: anomalies.length === 0,
      anomalies,
    }
  }

  protected async saveToDatabase(data: MPDetailData[]): Promise<void> {
    this.logInfo(`Saving ${data.length} MP details to database...`)

    let updatedCount = 0
    let committeeRolesSaved = 0

    for (const mpData of data) {
      try {
        // Find MP by personId
        const existingMPs = await db
          .select()
          .from(mps)
          .where(eq(mps.personId, mpData.personId))
          .limit(1)

        if (existingMPs.length === 0) {
          this.logWarning(`MP with personId ${mpData.personId} not found in database, skipping`)
          continue
        }

        const existing = existingMPs[0]

        // Sanitize and title case all text fields
        const sanitizedFullName = sanitizeName(mpData.fullName)
        const sanitizedConstituency = sanitizeConstituencyName(mpData.constituencyName)
        const sanitizedProvince = sanitizeName(mpData.province)
        const sanitizedCaucus = mpData.caucusShortName
          ? sanitizeCaucusName(mpData.caucusShortName)
          : undefined

        // Smart merge: preserve clean existing data when possible
        const mergedFullName = smartMergeText(existing.fullName, sanitizedFullName)
        const mergedConstituency = smartMergeText(existing.constituencyName, sanitizedConstituency)
        const mergedProvince = smartMergeText(existing.province, sanitizedProvince)
        const mergedCaucus = mpData.caucusShortName
          ? smartMergeText(existing.caucusShortName || null, sanitizedCaucus || null)
          : existing.caucusShortName

        // Update MP basic info
        await db
          .update(mps)
          .set({
            fullName: mergedFullName,
            constituencyName: mergedConstituency,
            province: mergedProvince,
            caucusShortName: mergedCaucus || undefined,
            photoUrl: mpData.photoUrl || existing.photoUrl,
            updatedAt: new Date(),
          })
          .where(eq(mps.id, existing.id))

        updatedCount++

        // Save committee roles
        if (mpData.committeeRoles && mpData.committeeRoles.length > 0) {
          for (const role of mpData.committeeRoles) {
            // Check if committee role already exists (avoid duplicates)
            // Strategy:
            // - If affiliationRoleName is provided: match by mpId, committeeName, AND role (exact match)
            // - If affiliationRoleName is empty: match by mpId and committeeName (any role)
            //   This prevents duplicate records while preserving existing role data
            const whereConditions = [
              eq(committeeParticipation.mpId, existing.id),
              eq(committeeParticipation.committeeName, role.committeeName),
            ]
            
            if (role.affiliationRoleName) {
              // Role is provided: match by mpId, committeeName, AND role (exact match)
              whereConditions.push(eq(committeeParticipation.role, role.affiliationRoleName))
            }
            // If role is empty, we match by mpId and committeeName only (no role filter)
            // This ensures we find existing records regardless of their role value

            const existingRoles = await db
              .select()
              .from(committeeParticipation)
              .where(and(...whereConditions))
              .limit(1)

            if (existingRoles.length === 0) {
              // Insert new committee role
              await db.insert(committeeParticipation).values({
                mpId: existing.id,
                committeeName: role.committeeName,
                role: role.affiliationRoleName || null,
                startDate: role.fromDateTime || null,
                endDate: role.toDateTime || null,
              })
              committeeRolesSaved++
            } else {
              // Update existing role
              // Preserve existing role if new data has no role value
              await db
                .update(committeeParticipation)
                .set({
                  // Only update role if we have a new role value (don't overwrite existing role with null)
                  role: role.affiliationRoleName || existingRoles[0].role || null,
                  startDate: role.fromDateTime || null,
                  endDate: role.toDateTime || null,
                  updatedAt: new Date(),
                })
                .where(eq(committeeParticipation.id, existingRoles[0].id))
            }
          }
        }

        // TODO: Save parliamentary positions, caucus roles, and election candidate roles
        // These might need new tables or JSONB columns
      } catch (error) {
        this.logError(
          `Failed to save MP details for ${mpData.fullName} (PersonId: ${mpData.personId}):`,
          error
        )
      }
    }

    this.logInfo(
      `MP details saved: ${updatedCount} MPs updated, ${committeeRolesSaved} committee roles saved`
    )
  }
}

