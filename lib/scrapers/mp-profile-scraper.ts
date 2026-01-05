import { BaseScraper, ScraperResult } from './base-scraper'
import { db } from '../db'
import { mps } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { Browser, Page } from 'playwright'

interface MPProfileData {
  mpId: number
  photoUrl: string
}

/**
 * Scraper for MP profile photos from ourcommons.ca
 */
export class MPProfileScraper extends BaseScraper<MPProfileData> {
  private readonly baseUrl = 'https://www.ourcommons.ca/Members/en'

  protected getSourceUrl(): string {
    return this.baseUrl
  }

  protected async scrapeXML(): Promise<ScraperResult<MPProfileData[]>> {
    // MP profiles are HTML-based, so XML scraping is not applicable
    return {
      success: false,
      error: 'MP profile scraper requires HTML parsing, use Playwright method',
    }
  }

  protected async scrapeWithPlaywright(): Promise<ScraperResult<MPProfileData[]>> {
    try {
      this.logInfo('Scraping MP profile photos with Playwright...')
      const browser = await this.getBrowser()
      const page = await browser.newPage()

      try {
        // Get all MPs from database
        const allMPs = await db.select({ id: mps.id, fullName: mps.fullName, slug: mps.slug }).from(mps)
        const profileData: MPProfileData[] = []

        for (const mp of allMPs) {
          try {
            // Navigate to MP's profile page
            // The URL structure may vary - adjust based on actual site structure
            const mpUrl = `${this.baseUrl}/${mp.slug || mp.fullName.toLowerCase().replace(/\s+/g, '-')}`
            
            await page.goto(mpUrl, { waitUntil: 'networkidle', timeout: this.timeout })

            // Extract photo URL
            const photoUrl = await page.evaluate(() => {
              // Try multiple selectors for MP photo
              const selectors = [
                'img.member-photo',
                'img[alt*="Member"]',
                '.member-image img',
                '.profile-photo img',
                'img[src*="photo"]',
                'img[src*="member"]',
              ]

              for (const selector of selectors) {
                const img = document.querySelector(selector) as HTMLImageElement | null
                if (img && img.src) {
                  return img.src
                }
              }

              return null
            })

            if (photoUrl) {
              profileData.push({
                mpId: mp.id,
                photoUrl,
              })
            } else {
              this.logWarning(`Could not find photo for MP: ${mp.fullName}`)
            }

            // Small delay to avoid rate limiting
            await this.delay(1000)
          } catch (error) {
            this.logError(`Failed to scrape profile for MP ${mp.fullName}:`, error)
          }
        }

        this.logInfo(`Scraped ${profileData.length} MP profile photos`)
        return {
          success: true,
          data: profileData,
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

  protected validateData(data: MPProfileData[]): { isValid: boolean; anomalies: string[] } {
    const anomalies: string[] = []

    // Check for required fields
    const missingFields = data.filter((profile) => !profile.mpId || !profile.photoUrl)
    if (missingFields.length > 0) {
      anomalies.push(`${missingFields.length} profiles with missing required fields`)
    }

    // Check for valid URLs
    const invalidUrls = data.filter((profile) => {
      try {
        new URL(profile.photoUrl)
        return false
      } catch {
        return true
      }
    })
    if (invalidUrls.length > 0) {
      anomalies.push(`${invalidUrls.length} profiles with invalid photo URLs`)
    }

    // Check for duplicate MP IDs
    const mpIds = new Set<number>()
    const duplicates: MPProfileData[] = []
    for (const profile of data) {
      if (mpIds.has(profile.mpId)) {
        duplicates.push(profile)
      }
      mpIds.add(profile.mpId)
    }
    if (duplicates.length > 0) {
      anomalies.push(`${duplicates.length} duplicate MP profiles detected`)
    }

    return {
      isValid: anomalies.length === 0,
      anomalies,
    }
  }

  protected async saveToDatabase(data: MPProfileData[]): Promise<void> {
    this.logInfo(`Saving ${data.length} MP profile photos to database...`)

    for (const profile of data) {
      try {
        await db
          .update(mps)
          .set({
            photoUrl: profile.photoUrl,
            updatedAt: new Date(),
          })
          .where(eq(mps.id, profile.mpId))
      } catch (error) {
        this.logError(`Failed to save profile photo for MP ${profile.mpId}:`, error)
      }
    }

    this.logInfo('MP profile photos saved successfully')
  }
}

