import { parseString } from 'xml2js'
import { promisify } from 'util'
import { db } from '../index'
import { mps } from '../schema'
import { eq } from 'drizzle-orm'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: '.env.local' })

const parseXML = promisify(parseString)

interface MPXMLData {
  PersonId?: Array<{ _?: string }>
  PersonOfficialFirstName?: Array<{ _?: string }>
  PersonOfficialLastName?: Array<{ _?: string }>
  ConstituencyName?: Array<{ _?: string }>
  ConstituencyProvinceTerritoryName?: Array<{ _?: string }>
  CaucusShortName?: Array<{ _?: string }>
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
 * Calculate similarity between two names (simple Levenshtein-like comparison)
 * Returns a score between 0 and 1, where 1 is exact match
 */
function nameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1)
  const n2 = normalizeName(name2)
  
  if (n1 === n2) return 1.0
  
  // Check if one contains the other (for cases like "John" vs "John Smith")
  if (n1.includes(n2) || n2.includes(n1)) {
    return 0.9
  }
  
  // Simple character-based similarity
  const longer = n1.length > n2.length ? n1 : n2
  const shorter = n1.length > n2.length ? n2 : n1
  
  if (longer.length === 0) return 1.0
  
  let matches = 0
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      matches++
    }
  }
  
  return matches / longer.length
}

/**
 * Match confidence levels
 */
enum MatchConfidence {
  EXACT = 'exact',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  NONE = 'none',
}

/**
 * Determine match confidence between database MP and XML MP
 */
function getMatchConfidence(
  dbFirstName: string,
  dbLastName: string,
  xmlFirstName: string,
  xmlLastName: string,
  dbConstituency: string,
  xmlConstituency: string
): { confidence: MatchConfidence; score: number } {
  const firstNameSim = nameSimilarity(dbFirstName, xmlFirstName)
  const lastNameSim = nameSimilarity(dbLastName, xmlLastName)
  const constituencySim = nameSimilarity(dbConstituency, xmlConstituency || '')
  
  // Exact match
  if (
    normalizeName(dbFirstName) === normalizeName(xmlFirstName) &&
    normalizeName(dbLastName) === normalizeName(xmlLastName) &&
    normalizeName(dbConstituency) === normalizeName(xmlConstituency || '')
  ) {
    return { confidence: MatchConfidence.EXACT, score: 1.0 }
  }
  
  // High confidence: exact name match (first + last) regardless of constituency
  if (
    normalizeName(dbFirstName) === normalizeName(xmlFirstName) &&
    normalizeName(dbLastName) === normalizeName(xmlLastName)
  ) {
    return { confidence: MatchConfidence.HIGH, score: 0.95 }
  }
  
  // High confidence: very similar names (>= 0.9 similarity) and matching constituency
  const nameSim = (firstNameSim + lastNameSim) / 2
  if (nameSim >= 0.9 && constituencySim >= 0.8) {
    return { confidence: MatchConfidence.HIGH, score: nameSim * 0.9 }
  }
  
  // Medium confidence: similar names but lower similarity
  if (nameSim >= 0.8) {
    return { confidence: MatchConfidence.MEDIUM, score: nameSim * 0.7 }
  }
  
  // Low confidence: some similarity but not enough
  if (nameSim >= 0.6) {
    return { confidence: MatchConfidence.LOW, score: nameSim * 0.5 }
  }
  
  return { confidence: MatchConfidence.NONE, score: 0 }
}

async function backfillPersonIds() {
  console.log('🔄 Starting PersonId backfill process...')
  
  const unmatchedMPs: UnmatchedMP[] = []
  const logFilePath = path.join(process.cwd(), 'lib/db/migrations', 'backfill-person-id-unmatched.log')
  
  try {
    // Fetch XML from House of Commons
    console.log('📥 Fetching MP list from XML endpoint...')
    const xmlUrl = 'https://www.ourcommons.ca/Members/en/search/XML'
    const response = await fetch(xmlUrl, {
      signal: AbortSignal.timeout(30000),
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const xmlText = await response.text()
    const parsed = (await parseXML(xmlText)) as MPsXMLResponse
    
    if (!parsed.MembersOfParliament?.MemberOfParliament) {
      throw new Error('No MPs found in XML response')
    }
    
    const xmlMPs = parsed.MembersOfParliament.MemberOfParliament
    console.log(`✅ Found ${xmlMPs.length} MPs in XML`)
    
    // Get all existing MPs from database
    console.log('📊 Fetching existing MPs from database...')
    const existingMPs = await db.select().from(mps)
    console.log(`✅ Found ${existingMPs.length} MPs in database`)
    
    // Create a map of XML MPs by normalized name for quick lookup
    const xmlMPMap = new Map<string, MPXMLData>()
    for (const xmlMP of xmlMPs) {
      const firstName = xmlMP.PersonOfficialFirstName?.[0]?._ || ''
      const lastName = xmlMP.PersonOfficialLastName?.[0]?._ || ''
      if (firstName && lastName) {
        const key = `${normalizeName(firstName)}|${normalizeName(lastName)}`
        xmlMPMap.set(key, xmlMP)
      }
    }
    
    let matchedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    
    // Process each database MP
    console.log('🔍 Matching MPs...')
    for (const dbMP of existingMPs) {
      // Skip if already has personId
      if (dbMP.personId) {
        skippedCount++
        continue
      }
      
      // Extract first and last name from fullName
      // Assuming fullName format is "FirstName LastName" or "FirstName MiddleName LastName"
      const nameParts = dbMP.fullName.trim().split(/\s+/)
      if (nameParts.length < 2) {
        unmatchedMPs.push({
          dbId: dbMP.id,
          dbFullName: dbMP.fullName,
          dbConstituency: dbMP.constituencyName,
          reason: 'Cannot parse name (less than 2 parts)',
        })
        continue
      }
      
      const dbFirstName = nameParts[0]
      const dbLastName = nameParts[nameParts.length - 1]
      
      // Try to find exact match first
      const exactKey = `${normalizeName(dbFirstName)}|${normalizeName(dbLastName)}`
      let bestMatch: MPXMLData | null = null
      let bestConfidence: MatchConfidence = MatchConfidence.NONE
      let bestScore = 0
      
      if (xmlMPMap.has(exactKey)) {
        bestMatch = xmlMPMap.get(exactKey)!
        const match = getMatchConfidence(
          dbFirstName,
          dbLastName,
          bestMatch.PersonOfficialFirstName?.[0]?._ || '',
          bestMatch.PersonOfficialLastName?.[0]?._ || '',
          dbMP.constituencyName,
          bestMatch.ConstituencyName?.[0]?._ || ''
        )
        bestConfidence = match.confidence
        bestScore = match.score
      } else {
        // Try to find best match by comparing with all XML MPs
        for (const xmlMP of xmlMPs) {
          const xmlFirstName = xmlMP.PersonOfficialFirstName?.[0]?._ || ''
          const xmlLastName = xmlMP.PersonOfficialLastName?.[0]?._ || ''
          
          if (!xmlFirstName || !xmlLastName) continue
          
          const match = getMatchConfidence(
            dbFirstName,
            dbLastName,
            xmlFirstName,
            xmlLastName,
            dbMP.constituencyName,
            xmlMP.ConstituencyName?.[0]?._ || ''
          )
          
          if (match.score > bestScore) {
            bestScore = match.score
            bestConfidence = match.confidence
            bestMatch = xmlMP
          }
        }
      }
      
      // Only update if we have HIGH or EXACT confidence
      if (bestMatch && (bestConfidence === MatchConfidence.EXACT || bestConfidence === MatchConfidence.HIGH)) {
        const personId = bestMatch.PersonId?.[0]?._ || ''
        if (personId) {
          await db
            .update(mps)
            .set({ personId })
            .where(eq(mps.id, dbMP.id))
          
          updatedCount++
          matchedCount++
          console.log(
            `✅ Matched: ${dbMP.fullName} (${dbMP.constituencyName}) -> PersonId: ${personId} (${bestConfidence})`
          )
        } else {
          unmatchedMPs.push({
            dbId: dbMP.id,
            dbFullName: dbMP.fullName,
            dbConstituency: dbMP.constituencyName,
            xmlFirstName: bestMatch.PersonOfficialFirstName?.[0]?._,
            xmlLastName: bestMatch.PersonOfficialLastName?.[0]?._,
            xmlConstituency: bestMatch.ConstituencyName?.[0]?._,
            reason: 'Matched but PersonId is missing in XML',
          })
        }
      } else {
        // No high-confidence match found
        unmatchedMPs.push({
          dbId: dbMP.id,
          dbFullName: dbMP.fullName,
          dbConstituency: dbMP.constituencyName,
          reason: `No high-confidence match found (best score: ${bestScore.toFixed(2)})`,
        })
      }
    }
    
    // Write unmatched MPs to log file
    if (unmatchedMPs.length > 0) {
      const logContent = [
        `PersonId Backfill - Unmatched MPs Report`,
        `Generated: ${new Date().toISOString()}`,
        `Total Unmatched: ${unmatchedMPs.length}`,
        ``,
        ...unmatchedMPs.map((mp) => {
          return [
            `ID: ${mp.dbId}`,
            `Database Name: ${mp.dbFullName}`,
            `Database Constituency: ${mp.dbConstituency}`,
            mp.xmlFirstName ? `XML First Name: ${mp.xmlFirstName}` : '',
            mp.xmlLastName ? `XML Last Name: ${mp.xmlLastName}` : '',
            mp.xmlConstituency ? `XML Constituency: ${mp.xmlConstituency}` : '',
            `Reason: ${mp.reason}`,
            `---`,
          ]
            .filter(Boolean)
            .join('\n')
        }),
      ].join('\n')
      
      fs.writeFileSync(logFilePath, logContent, 'utf-8')
      console.log(`📝 Wrote ${unmatchedMPs.length} unmatched MPs to: ${logFilePath}`)
    }
    
    console.log('\n📊 Backfill Summary:')
    console.log(`   Total XML MPs: ${xmlMPs.length}`)
    console.log(`   Total Database MPs: ${existingMPs.length}`)
    console.log(`   Already had PersonId: ${skippedCount}`)
    console.log(`   Successfully Matched & Updated: ${matchedCount}`)
    console.log(`   Unmatched (needs manual review): ${unmatchedMPs.length}`)
    
    if (unmatchedMPs.length > 0) {
      console.log(`\n⚠️  Please review the log file: ${logFilePath}`)
      console.log(`   After manual review, you can update personId directly in the database.`)
    }
    
    console.log('\n✅ Backfill process completed!')
  } catch (error) {
    console.error('❌ Backfill failed:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  backfillPersonIds()
    .then(() => {
      process.exit(0)
    })
    .catch((error) => {
      console.error('Backfill failed:', error)
      process.exit(1)
    })
}

