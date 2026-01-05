#!/usr/bin/env tsx
/**
 * Backfill personId for existing MPs in production database
 * Matches MPs by name and updates them with personId from XML
 * 
 * Usage:
 *   NODE_ENV=production tsx scripts/backfill-personid-production.ts
 * 
 * This script:
 * 1. Fetches XML from ourcommons.ca
 * 2. Matches existing MPs by name (first + last name)
 * 3. Updates personId for matched MPs
 * 4. Logs unmatched MPs for manual review
 */

import { parseString } from 'xml2js'
import { promisify } from 'util'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

// Load production environment variables
dotenv.config({ path: '.env.production' })

// Also load .env.local as fallback
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env.local' })
}

// Import after env vars are loaded (will be done in async function)

const parseXML = promisify(parseString)

interface MPXMLData {
  PersonId?: Array<{ _?: string }>
  PersonOfficialFirstName?: Array<{ _?: string }>
  PersonOfficialLastName?: Array<{ _?: string }>
  ConstituencyName?: Array<{ _?: string }>
  ConstituencyProvinceTerritoryName?: Array<{ _?: string }>
}

interface MPsXMLResponse {
  MembersOfParliament?: {
    MemberOfParliament?: Array<MPXMLData>
  }
}

interface UnmatchedMP {
  dbId: number
  dbFullName: string
  dbConstituency: string
  xmlFirstName?: string
  xmlLastName?: string
  xmlConstituency?: string
  reason: string
}

/**
 * Normalize a name for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Extract text from XML array field
 */
function extractText(field?: Array<{ _?: string }>): string | undefined {
  if (!field || field.length === 0) return undefined
  const value = field[0]._ || field[0]
  return typeof value === 'string' ? value.trim() : undefined
}

async function backfillPersonIds() {
  console.log('🔄 Starting personId backfill for production...\n')

  // Import after env vars are loaded
  const { db } = await import('../lib/db/index.js')
  const { mps } = await import('../lib/db/schema.js')
  const { eq, and, isNull } = await import('drizzle-orm')

  try {
    // Fetch XML from ourcommons.ca
    console.log('📥 Fetching MP list from ourcommons.ca...')
    const response = await fetch('https://www.ourcommons.ca/Members/en/search/XML')
    if (!response.ok) {
      throw new Error(`Failed to fetch XML: ${response.status} ${response.statusText}`)
    }
    const xmlText = await response.text()
    console.log('✅ XML fetched successfully\n')

    // Parse XML
    console.log('📝 Parsing XML...')
    const parsed = (await parseXML(xmlText, {
      explicitArray: true,
      mergeAttrs: false,
      explicitRoot: true,
      charkey: '_',
    })) as MPsXMLResponse

    const xmlMPs = parsed.MembersOfParliament?.MemberOfParliament || []
    console.log(`✅ Parsed ${xmlMPs.length} MPs from XML\n`)

    // Get all existing MPs without personId
    console.log('🔍 Finding MPs without personId...')
    const existingMPs = await db
      .select()
      .from(mps)
      .where(isNull(mps.personId))

    console.log(`📊 Found ${existingMPs.length} MPs without personId\n`)

    if (existingMPs.length === 0) {
      console.log('✅ All MPs already have personId!')
      return
    }

    // Create a map of XML MPs by normalized name
    const xmlMap = new Map<string, MPXMLData>()
    for (const xmlMP of xmlMPs) {
      const firstName = extractText(xmlMP.PersonOfficialFirstName)
      const lastName = extractText(xmlMP.PersonOfficialLastName)
      if (firstName && lastName) {
        const normalizedName = `${normalizeName(firstName)} ${normalizeName(lastName)}`
        xmlMap.set(normalizedName, xmlMP)
      }
    }

    // Match and update MPs
    let matchedCount = 0
    let updatedCount = 0
    const unmatched: UnmatchedMP[] = []

    console.log('🔄 Matching and updating MPs...\n')

    for (const dbMP of existingMPs) {
      if (!dbMP.fullName) {
        unmatched.push({
          dbId: dbMP.id,
          dbFullName: dbMP.fullName || 'Unknown',
          dbConstituency: dbMP.constituencyName || 'Unknown',
          reason: 'Missing full name in database',
        })
        continue
      }

      // Try to match by full name
      const normalizedDbName = normalizeName(dbMP.fullName)
      const xmlMP = xmlMap.get(normalizedDbName)

      if (xmlMP) {
        const personId = extractText(xmlMP.PersonId)
        if (personId) {
          // High confidence match - update
          await db
            .update(mps)
            .set({
              personId,
              updatedAt: new Date(),
            })
            .where(eq(mps.id, dbMP.id))

          matchedCount++
          updatedCount++
          console.log(`   ✅ Matched: ${dbMP.fullName} → personId: ${personId}`)
        } else {
          unmatched.push({
            dbId: dbMP.id,
            dbFullName: dbMP.fullName,
            dbConstituency: dbMP.constituencyName || 'Unknown',
            xmlFirstName: extractText(xmlMP.PersonOfficialFirstName),
            xmlLastName: extractText(xmlMP.PersonOfficialLastName),
            reason: 'XML MP found but missing PersonId',
          })
        }
      } else {
        // No match found
        unmatched.push({
          dbId: dbMP.id,
          dbFullName: dbMP.fullName,
          dbConstituency: dbMP.constituencyName || 'Unknown',
          reason: 'No matching MP found in XML',
        })
      }
    }

    console.log(`\n✅ Backfill complete!`)
    console.log(`   📊 Matched: ${matchedCount}`)
    console.log(`   ✏️  Updated: ${updatedCount}`)
    console.log(`   ⚠️  Unmatched: ${unmatched.length}\n`)

    // Log unmatched MPs to file
    if (unmatched.length > 0) {
      const logDir = path.join(process.cwd(), 'logs')
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      const logFile = path.join(logDir, `unmatched-mps-production-${Date.now()}.json`)
      fs.writeFileSync(logFile, JSON.stringify(unmatched, null, 2))
      console.log(`📝 Unmatched MPs logged to: ${logFile}`)
      console.log(`\n⚠️  Review unmatched MPs and update manually if needed\n`)
    }

    // Verify results
    const remainingMPs = await db
      .select()
      .from(mps)
      .where(isNull(mps.personId))

    console.log(`\n📊 Remaining MPs without personId: ${remainingMPs.length}`)
    if (remainingMPs.length > 0) {
      console.log(`   These need manual review:`)
      remainingMPs.forEach((mp) => {
        console.log(`   - ID ${mp.id}: ${mp.fullName} (${mp.constituencyName})`)
      })
    } else {
      console.log(`\n🎉 All MPs now have personId!`)
    }
  } catch (error) {
    console.error('\n❌ Backfill failed:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
      console.error('   Error stack:', error.stack)
    }
    process.exit(1)
  }
}

backfillPersonIds()
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })

