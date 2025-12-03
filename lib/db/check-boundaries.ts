import * as dotenv from 'dotenv'
import postgres from 'postgres'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = postgres(process.env.DATABASE_URL)

async function checkBoundaries() {
  try {
    // Get total count
    const countResult = await client`SELECT COUNT(*) as count FROM riding_boundaries`
    const total = countResult[0]?.count || 0
    console.log(`\n📊 Total boundaries in database: ${total}`)

    // Check for duplicates by riding name
    const duplicates = await client`
      SELECT riding_name, province, COUNT(*) as count
      FROM riding_boundaries
      GROUP BY riding_name, province
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `
    
    if (duplicates.length > 0) {
      console.log(`\n⚠️  Found ${duplicates.length} duplicate riding names:`)
      duplicates.forEach((dup: any) => {
        console.log(`   - ${dup.riding_name}, ${dup.province}: ${dup.count} entries`)
      })
    } else {
      console.log(`\n✅ No duplicate riding names found`)
    }

    // Check for null or empty values
    const nullNames = await client`
      SELECT COUNT(*) as count
      FROM riding_boundaries
      WHERE riding_name IS NULL OR riding_name = ''
    `
    console.log(`\n📝 Null or empty riding names: ${nullNames[0]?.count || 0}`)

    // List all provinces and their counts
    const provinceCounts = await client`
      SELECT province, COUNT(*) as count
      FROM riding_boundaries
      GROUP BY province
      ORDER BY count DESC
    `
    console.log(`\n🗺️  Boundaries by province:`)
    provinceCounts.forEach((pc: any) => {
      console.log(`   ${pc.province}: ${pc.count}`)
    })

    // Check for invalid geometries
    const invalidGeoms = await client`
      SELECT COUNT(*) as count
      FROM riding_boundaries
      WHERE NOT ST_IsValid(geom::geometry)
    `
    console.log(`\n🔍 Invalid geometries: ${invalidGeoms[0]?.count || 0}`)

    // Show sample of boundaries
    console.log(`\n📋 Sample boundaries (first 10):`)
    const samples = await client`
      SELECT id, riding_name, province
      FROM riding_boundaries
      ORDER BY id
      LIMIT 10
    `
    samples.forEach((s: any) => {
      console.log(`   ${s.id}: ${s.riding_name}, ${s.province}`)
    })

  } catch (error) {
    console.error('❌ Error checking boundaries:', error)
  } finally {
    await client.end()
  }
}

checkBoundaries()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Failed:', error)
    process.exit(1)
  })

