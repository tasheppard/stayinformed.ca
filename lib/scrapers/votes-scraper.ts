import { parseString } from 'xml2js'
import { promisify } from 'util'
import { BaseScraper, ScraperResult } from './base-scraper'
import { db } from '../db'
import { votes, mps } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { Browser, Page } from 'playwright'

const parseXML = promisify(parseString)

interface VoteData {
  mpId: number
  voteNumber: number
  session: string
  date: Date
  billNumber?: string
  billTitle?: string
  voteResult: 'Yea' | 'Nay' | 'Paired' | 'Abstained'
}

interface VotesXMLResponse {
  Votes?: {
    Vote?: Array<{
      VoteNumber?: Array<{ _?: string }>
      Session?: Array<{ _?: string }>
      VoteDate?: Array<{ _?: string }>
      BillNumber?: Array<{ _?: string }>
      BillTitle?: Array<{ _?: string }>
      MemberVotes?: Array<{
        Member?: Array<{
          MemberOfParliament?: Array<{
            PersonId?: Array<{ _?: string }>
            PersonOfficialFirstName?: Array<{ _?: string }>
            PersonOfficialLastName?: Array<{ _?: string }>
          }>
          Vote?: Array<{ _?: string }>
        }>
      }>
    }>
  }
}

/**
 * Scraper for voting records from ourcommons.ca/Members/en/Votes/XML
 */
export class VotesScraper extends BaseScraper<VoteData> {
  private readonly baseUrl = 'https://www.ourcommons.ca/Members/en/Votes/XML'

  protected getSourceUrl(): string {
    return this.baseUrl
  }

  protected async scrapeXML(): Promise<ScraperResult<VoteData[]>> {
    try {
      this.logInfo('Fetching voting records XML...')
      
      const response = await fetch(this.baseUrl, {
        signal: AbortSignal.timeout(this.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const xmlText = await response.text()
      const parsed = (await parseXML(xmlText)) as VotesXMLResponse

      if (!parsed.Votes?.Vote) {
        return {
          success: false,
          error: 'No votes found in XML response',
        }
      }

      const voteData: VoteData[] = []
      const mpPersonIdMap = await this.getMPPersonIdMap()
      const mpNameMap = await this.getMPNameMap() // Fallback for backward compatibility

      for (const vote of parsed.Votes.Vote) {
        const voteNumber = parseInt(vote.VoteNumber?.[0]?._ || '0', 10)
        const session = vote.Session?.[0]?._ || ''
        const voteDateStr = vote.VoteDate?.[0]?._ || ''
        const billNumber = vote.BillNumber?.[0]?._ || undefined
        const billTitle = vote.BillTitle?.[0]?._ || undefined

        if (!voteNumber || !session || !voteDateStr) {
          this.logWarning(`Skipping vote with missing required fields`)
          continue
        }

        const voteDate = new Date(voteDateStr)

        // Process member votes
        const memberVotes = vote.MemberVotes?.[0]?.Member || []
        for (const member of memberVotes) {
          const personId = member.MemberOfParliament?.[0]?.PersonId?.[0]?._ || ''
          const firstName = member.MemberOfParliament?.[0]?.PersonOfficialFirstName?.[0]?._ || ''
          const lastName = member.MemberOfParliament?.[0]?.PersonOfficialLastName?.[0]?._ || ''
          const voteResult = member.Vote?.[0]?._ || ''

          if (!voteResult) {
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
              this.logWarning(`Skipping vote: missing name and PersonId`)
              continue
            }
          }

          // Map vote result to our schema
          let mappedResult: 'Yea' | 'Nay' | 'Paired' | 'Abstained'
          const voteResultLower = voteResult.toLowerCase()
          if (voteResultLower.includes('yea') || voteResultLower.includes('yes')) {
            mappedResult = 'Yea'
          } else if (voteResultLower.includes('nay') || voteResultLower.includes('no')) {
            mappedResult = 'Nay'
          } else if (voteResultLower.includes('paired')) {
            mappedResult = 'Paired'
          } else {
            mappedResult = 'Abstained'
          }

          voteData.push({
            mpId,
            voteNumber,
            session,
            date: voteDate,
            billNumber,
            billTitle,
            voteResult: mappedResult,
          })
        }
      }

      this.logInfo(`Scraped ${voteData.length} votes`)
      return {
        success: true,
        data: voteData,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected async scrapeWithPlaywright(): Promise<ScraperResult<VoteData[]>> {
    try {
      this.logInfo('Scraping votes with Playwright...')
      const browser = await this.getBrowser()
      const page = await browser.newPage()

      try {
        await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: this.timeout })
        
        // Wait for XML content to load
        await page.waitForSelector('body', { timeout: this.timeout })
        
        const xmlContent = await page.content()
        const parsed = (await parseXML(xmlContent)) as VotesXMLResponse

        // Reuse XML parsing logic
        const xmlResult = await this.scrapeXML()
        if (xmlResult.success) {
          return xmlResult
        }

        // If XML parsing fails, try to extract from HTML
        // This is a fallback - the page might render differently
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

  protected validateData(data: VoteData[]): { isValid: boolean; anomalies: string[] } {
    const anomalies: string[] = []

    // Check for required fields
    const missingFields = data.filter(
      (vote) => !vote.mpId || !vote.voteNumber || !vote.session || !vote.date
    )
    if (missingFields.length > 0) {
      anomalies.push(`${missingFields.length} votes with missing required fields`)
    }

    // Check for duplicate votes (same MP, same vote number)
    const voteKeys = new Set<string>()
    const duplicates: VoteData[] = []
    for (const vote of data) {
      const key = `${vote.mpId}-${vote.voteNumber}`
      if (voteKeys.has(key)) {
        duplicates.push(vote)
      }
      voteKeys.add(key)
    }
    if (duplicates.length > 0) {
      anomalies.push(`${duplicates.length} duplicate votes detected`)
    }

    // Check for future dates
    const now = new Date()
    const futureVotes = data.filter((vote) => vote.date > now)
    if (futureVotes.length > 0) {
      anomalies.push(`${futureVotes.length} votes with future dates`)
    }

    return {
      isValid: anomalies.length === 0,
      anomalies,
    }
  }

  protected async saveToDatabase(data: VoteData[]): Promise<void> {
    this.logInfo(`Saving ${data.length} votes to database...`)

    // Use upsert to avoid duplicates
    for (const vote of data) {
      try {
        // Check if vote already exists
        const existing = await db
          .select()
          .from(votes)
          .where(and(eq(votes.mpId, vote.mpId), eq(votes.voteNumber, vote.voteNumber)))
          .limit(1)

        if (existing.length === 0) {
          await db.insert(votes).values({
            mpId: vote.mpId,
            voteNumber: vote.voteNumber,
            session: vote.session,
            date: vote.date,
            billNumber: vote.billNumber,
            billTitle: vote.billTitle,
            voteResult: vote.voteResult,
          })
        } else {
          // Update existing vote (in case data has changed)
          await db
            .update(votes)
            .set({
              session: vote.session,
              date: vote.date,
              billNumber: vote.billNumber,
              billTitle: vote.billTitle,
              voteResult: vote.voteResult,
            })
            .where(and(eq(votes.mpId, vote.mpId), eq(votes.voteNumber, vote.voteNumber)))
        }
      } catch (error) {
        this.logError(`Failed to save vote ${vote.voteNumber} for MP ${vote.mpId}:`, error)
      }
    }

    this.logInfo('Votes saved successfully')
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

