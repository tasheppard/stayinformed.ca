#!/usr/bin/env tsx
/**
 * Populate photo URLs for MPs based on the ourcommons.ca photo URL pattern
 * 
 * URL Pattern: https://www.ourcommons.ca/Content/Parliamentarians/Images/OfficialMPPhotos/45/[LastName][FirstName]_[PartyCode].jpg
 * 
 * Usage:
 *   tsx scripts/populate-photo-urls.ts
 * 
 * Environment variables:
 *   DATABASE_URL - Database connection string (required)
 */

import * as dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
dotenv.config({ path: '.env.local' })
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' })
}
if (!process.env.DATABASE_URL) {
  const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
  dotenv.config({ path: envFile })
}

/**
 * Map caucus names to party codes
 */
function getPartyCode(caucusShortName: string | null | undefined): string {
  if (!caucusShortName) {
    return 'Ind' // Independent for unknown/missing
  }

  const caucus = caucusShortName.trim()
  
  // Case-insensitive matching
  const lowerCaucus = caucus.toLowerCase()
  
  if (lowerCaucus.includes('liberal')) {
    return 'Lib'
  } else if (lowerCaucus.includes('conservative')) {
    return 'CPC'
  } else if (lowerCaucus.includes('ndp') || lowerCaucus === 'ndp') {
    return 'NDP'
  } else if (lowerCaucus.includes('bloc') || lowerCaucus.includes('québécois')) {
    return 'BQ'
  } else if (lowerCaucus.includes('green')) {
    return 'GP'
  } else {
    // Default to Independent for unknown parties
    return 'Ind'
  }
}

/**
 * Parse full name into firstName and lastName
 * Assumes format: "FirstName LastName" or "FirstName MiddleName LastName"
 * Uses last word as lastName, everything else as firstName
 */
function parseName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim()
  const parts = trimmed.split(/\s+/)
  
  if (parts.length === 0) {
    throw new Error(`Invalid name format: ${fullName}`)
  }
  
  if (parts.length === 1) {
    // Only one name - use as lastName
    return { firstName: '', lastName: parts[0] }
  }
  
  // Last word is lastName, everything else is firstName
  const lastName = parts[parts.length - 1]
  const firstName = parts.slice(0, -1).join(' ')
  
  return { firstName, lastName }
}

/**
 * Clean name for use in filename (remove spaces, keep hyphens and accents)
 * Removes spaces but keeps hyphens, apostrophes, periods, and accented characters
 * Only removes truly problematic special characters
 */
function cleanNameForFilename(name: string): string {
  return name
    .replace(/\s+/g, '') // Remove spaces
    // Keep hyphens, apostrophes, periods, and Unicode letters (including accented characters)
    // Remove only truly problematic characters like quotes, brackets, etc.
    .replace(/[^\p{L}\p{N}\-'.]/gu, '') // Keep Unicode letters (\p{L}), numbers (\p{N}), hyphens, apostrophes, periods
}

/**
 * Generate photo URL for an MP
 */
function generatePhotoUrl(
  fullName: string,
  caucusShortName: string | null | undefined
): string {
  const { firstName, lastName } = parseName(fullName)
  const partyCode = getPartyCode(caucusShortName)
  
  const cleanFirstName = cleanNameForFilename(firstName)
  const cleanLastName = cleanNameForFilename(lastName)
  
  const filename = `${cleanLastName}${cleanFirstName}_${partyCode}.jpg`
  const baseUrl = 'https://www.ourcommons.ca/Content/Parliamentarians/Images/OfficialMPPhotos/45'
  
  return `${baseUrl}/${filename}`
}

async function populatePhotoUrls() {
  const { db } = await import('../lib/db/index.js')
  const { mps } = await import('../lib/db/schema.js')
  const { eq, and, isNull, isNotNull } = await import('drizzle-orm')

  try {
    console.log('🖼️  Populating photo URLs for MPs...\n')

    // Get all active MPs (we'll regenerate all photo URLs to fix hyphen handling)
    const allActiveMPs = await db
      .select()
      .from(mps)
      .where(eq(mps.isActive, true))
      .limit(1000) // Process in batches if needed

    if (allActiveMPs.length === 0) {
      console.log('✅ No active MPs found\n')
      process.exit(0)
    }

    console.log(`📊 Found ${allActiveMPs.length} active MPs to process\n`)

    let successCount = 0
    let errorCount = 0
    const errors: Array<{ mp: string; error: string }> = []

    for (const mp of allActiveMPs) {
      try {
        if (!mp.fullName) {
          errors.push({
            mp: `ID ${mp.id}`,
            error: 'Missing fullName',
          })
          errorCount++
          continue
        }

        const photoUrl = generatePhotoUrl(mp.fullName, mp.caucusShortName)

        // Update MP with photo URL
        await db
          .update(mps)
          .set({
            photoUrl,
            updatedAt: new Date(),
          })
          .where(eq(mps.id, mp.id))

        successCount++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        errors.push({
          mp: `${mp.fullName} (ID: ${mp.id})`,
          error: errorMessage,
        })
        errorCount++
      }
    }

    console.log(`\n✅ Photo URL population completed!`)
    console.log(`   📊 Successfully updated: ${successCount} MPs`)
    console.log(`   ❌ Errors: ${errorCount} MPs`)

    if (errors.length > 0 && errors.length <= 20) {
      console.log(`\n⚠️  Errors encountered:`)
      errors.forEach(({ mp, error }) => {
        console.log(`   - ${mp}: ${error}`)
      })
    } else if (errors.length > 20) {
      console.log(`\n⚠️  ${errors.length} errors encountered (showing first 10):`)
      errors.slice(0, 10).forEach(({ mp, error }) => {
        console.log(`   - ${mp}: ${error}`)
      })
      console.log(`   ... and ${errors.length - 10} more`)
    }

    console.log('\n')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error populating photo URLs:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    process.exit(1)
  }
}

populatePhotoUrls().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

