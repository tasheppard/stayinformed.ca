import * as dotenv from 'dotenv'
import postgres from 'postgres'
import * as fs from 'fs'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = postgres(process.env.DATABASE_URL)

async function findMissing() {
  try {
    console.log('Loading GeoJSON file...')
    const geojsonContent = fs.readFileSync('data/geojson/federal-ridings.geojson', 'utf-8')
    const geojson = JSON.parse(geojsonContent)
    
    const features = geojson.features || []
    console.log(`\n📋 GeoJSON has ${features.length} features`)
    
    // Get all riding names from database
    const dbRidings = await client`
      SELECT riding_name, province
      FROM riding_boundaries
    `
    
    const dbSet = new Set(dbRidings.map((r: any) => `${r.riding_name}|${r.province}`))
    console.log(`📊 Database has ${dbSet.size} boundaries`)
    
    // Find missing features
    const missing: any[] = []
    
    for (const feature of features) {
      const props = feature.properties || {}
      const ridingName = props.FEDNAME || props.FEDENAME || props.FEDFNAME || 'Unknown'
      const provinceCode = props.PRUID || ''
      
      // Map province code to name
      const provinceMap: Record<string, string> = {
        '10': 'Newfoundland and Labrador',
        '11': 'Prince Edward Island',
        '12': 'Nova Scotia',
        '13': 'New Brunswick',
        '24': 'Quebec',
        '35': 'Ontario',
        '46': 'Manitoba',
        '47': 'Saskatchewan',
        '48': 'Alberta',
        '59': 'British Columbia',
        '60': 'Yukon',
        '61': 'Northwest Territories',
        '62': 'Nunavut',
      }
      const province = provinceMap[provinceCode] || 'Unknown'
      
      const key = `${ridingName}|${province}`
      if (!dbSet.has(key)) {
        missing.push({
          ridingName,
          province,
          provinceCode,
          feduid: props.FEDUID,
          properties: props
        })
      }
    }
    
    if (missing.length > 0) {
      console.log(`\n⚠️  Found ${missing.length} missing boundaries:`)
      missing.forEach((m, i) => {
        console.log(`\n   ${i + 1}. ${m.ridingName}, ${m.province}`)
        console.log(`      FEDUID: ${m.feduid}`)
        console.log(`      PRUID: ${m.provinceCode}`)
      })
      
      // Check if they might be duplicates with different names
      console.log(`\n🔍 Checking for similar names in database...`)
      for (const m of missing) {
        const similar = await client`
          SELECT riding_name, province
          FROM riding_boundaries
          WHERE province = ${m.province}
          AND (
            riding_name ILIKE ${`%${m.ridingName.split(' ')[0]}%`} OR
            riding_name ILIKE ${`%${m.ridingName.split('--')[0]}%`}
          )
        `
        if (similar.length > 0) {
          console.log(`\n   "${m.ridingName}" might match:`)
          similar.forEach((s: any) => {
            console.log(`      - ${s.riding_name}`)
          })
        }
      }
    } else {
      console.log(`\n✅ All features are in the database!`)
    }
    
    // Also check for potential duplicates in GeoJSON
    const geojsonRidings = new Map<string, number>()
    features.forEach((f: any) => {
      const props = f.properties || {}
      const name = props.FEDNAME || props.FEDENAME || 'Unknown'
      const code = props.PRUID || ''
      const key = `${name}|${code}`
      geojsonRidings.set(key, (geojsonRidings.get(key) || 0) + 1)
    })
    
    const geojsonDuplicates = Array.from(geojsonRidings.entries()).filter(([_, count]) => count > 1)
    if (geojsonDuplicates.length > 0) {
      console.log(`\n⚠️  Found ${geojsonDuplicates.length} duplicate names in GeoJSON:`)
      geojsonDuplicates.forEach(([key, count]) => {
        console.log(`   ${key}: ${count} times`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.end()
  }
}

findMissing()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Failed:', error)
    process.exit(1)
  })

