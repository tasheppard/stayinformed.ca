import * as dotenv from 'dotenv'
import * as fs from 'fs'
import postgres from 'postgres'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = postgres(process.env.DATABASE_URL)

/**
 * Map province code to province name
 */
function getProvinceName(code: string): string | null {
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
  return provinceMap[code] || null
}

/**
 * Import GeoJSON riding boundaries into PostGIS database
 * Usage: tsx lib/db/import-boundaries.ts <path-to-geojson>
 */
async function importBoundaries(geojsonPath: string) {
  try {
    console.log(`Reading GeoJSON: ${geojsonPath}`)

    // Read GeoJSON file
    const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8')
    const geojson: GeoJSON.FeatureCollection = JSON.parse(geojsonContent)

    console.log(`Found ${geojson.features.length} features`)

    let imported = 0
    let skipped = 0
    let errors = 0

    // Import each feature
    for (const feature of geojson.features) {
      try {
        // Extract properties
        const properties = feature.properties || {}
        
        // Try multiple property name patterns (federal ridings use FEDNAME)
        const ridingName = 
          properties.FEDNAME || 
          properties.FEDENAME ||
          properties.FEDFNAME ||
          properties.ED_NAME || 
          properties.EDNAME || 
          properties.NAME || 
          properties.CSDNAME || 
          properties.CDNAME ||
          properties.riding_name || 
          properties.name || 
          `Feature ${imported + 1}`
        
        // Map province code to province name
        const provinceCode = properties.PRUID || properties.PROV || properties.prov || ''
        const provinceName = getProvinceName(provinceCode) ||
          properties.PRNAME ||
          properties.PROVINCE || 
          properties.province || 
          'Unknown'
        
        const province = provinceName

        // Convert GeoJSON geometry to PostGIS geography
        // Check if coordinates are in projected system (large numbers) vs WGS84 (lat/lon)
        const coords = feature.geometry.coordinates
        const sampleCoord = Array.isArray(coords[0][0]) 
          ? (Array.isArray(coords[0][0][0]) ? coords[0][0][0][0] : coords[0][0][0])
          : coords[0][0]
        const needsTransform = Math.abs(sampleCoord) > 180 // If > 180, it's likely projected
        
        const geometryJson = JSON.stringify(feature.geometry)

        // Insert into database using PostGIS
        // Convert Polygon to MultiPolygon using ST_Multi, then transform if needed
        if (needsTransform) {
          // Transform from EPSG:3978 (NAD83 Canada Atlas Lambert) to WGS84 (4326)
          // Convert Polygon to MultiPolygon, transform, then convert to geography
          await client`
            INSERT INTO riding_boundaries (riding_name, province, geom)
            SELECT 
              ${ridingName}::varchar,
              ${province}::varchar,
              ST_Transform(
                ST_Multi(
                  ST_SetSRID(
                    ST_GeomFromGeoJSON(${geometryJson}),
                    3978
                  )
                ),
                4326
              )::geography
            WHERE ST_IsValid(
              ST_Transform(
                ST_Multi(
                  ST_SetSRID(
                    ST_GeomFromGeoJSON(${geometryJson}),
                    3978
                  )
                ),
                4326
              )
            )
            ON CONFLICT DO NOTHING
          `
        } else {
          // Already in WGS84, convert Polygon to MultiPolygon
          await client`
            INSERT INTO riding_boundaries (riding_name, province, geom)
            VALUES (
              ${ridingName}::varchar,
              ${province}::varchar,
              ST_Multi(ST_GeomFromGeoJSON(${geometryJson}))::geography
            )
            ON CONFLICT DO NOTHING
          `
        }

        imported++
        if (imported % 10 === 0) {
          console.log(`  Imported ${imported} boundaries...`)
        }
      } catch (error) {
        console.error(`  Error importing feature:`, error)
        errors++
      }
    }

    console.log(`\n✅ Import completed:`)
    console.log(`   Imported: ${imported}`)
    console.log(`   Skipped: ${skipped}`)
    console.log(`   Errors: ${errors}`)

    // Verify import
    const countResult = await client`SELECT COUNT(*) as count FROM riding_boundaries`
    console.log(`\n📊 Total boundaries in database: ${countResult[0]?.count || 0}`)
  } catch (error) {
    console.error('❌ Error importing boundaries:', error)
    throw error
  } finally {
    await client.end()
  }
}

// Run if called directly
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: tsx lib/db/import-boundaries.ts <path-to-geojson>')
  console.error('Example: tsx lib/db/import-boundaries.ts data/geojson/ridings.geojson')
  process.exit(1)
}

importBoundaries(args[0])
  .then(() => {
    console.log('Import completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Import failed:', error)
    process.exit(1)
  })

