import * as dotenv from 'dotenv'
import * as fs from 'fs'
import postgres from 'postgres'
import { parser } from 'stream-json'
import StreamValues from 'stream-json/streamers/StreamValues.js'
import { Readable } from 'stream'

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
 * Import a single feature into the database
 */
async function importFeature(feature: GeoJSON.Feature): Promise<boolean> {
  try {
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
      'Unknown'
    
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
    const needsTransform = Math.abs(sampleCoord) > 180
    
    const geometryJson = JSON.stringify(feature.geometry)

    // Insert into database using PostGIS
    if (needsTransform) {
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
    
    return true
  } catch (error: any) {
    console.error(`  Error: ${error.message}`)
    return false
  }
}

/**
 * Import GeoJSON riding boundaries into PostGIS database (streaming version)
 * Usage: tsx lib/db/import-boundaries-stream.ts <path-to-geojson>
 */
async function importBoundaries(geojsonPath: string) {
  try {
    console.log(`Reading GeoJSON: ${geojsonPath}`)

    let imported = 0
    let errors = 0
    let featureCount = 0
    let inFeaturesArray = false
    let currentFeature: any = null
    let featureDepth = 0

    return new Promise<void>((resolve, reject) => {
      const pipeline = fs.createReadStream(geojsonPath)
        .pipe(parser())
        .pipe(StreamValues.streamValues())

      pipeline.on('data', async (chunk: any) => {
        try {
          // Track when we're in the features array
          if (chunk.key === 'features') {
            inFeaturesArray = true
            return
          }

          // Process features
          if (inFeaturesArray && chunk.key !== undefined) {
            if (typeof chunk.key === 'number') {
              // This is a feature index
              currentFeature = chunk.value
              featureCount++
            } else if (chunk.value && typeof chunk.value === 'object' && chunk.value.type === 'Feature') {
              // Complete feature object
              const success = await importFeature(chunk.value as GeoJSON.Feature)
              if (success) {
                imported++
                if (imported % 10 === 0) {
                  console.log(`  Imported ${imported} boundaries...`)
                }
              } else {
                errors++
              }
            }
          }
        } catch (error: any) {
          console.error(`  Error processing chunk:`, error.message)
          errors++
        }
      })

      pipeline.on('end', async () => {
        console.log(`\n✅ Import completed:`)
        console.log(`   Imported: ${imported}`)
        console.log(`   Errors: ${errors}`)

        // Verify import
        const countResult = await client`SELECT COUNT(*) as count FROM riding_boundaries`
        console.log(`\n📊 Total boundaries in database: ${countResult[0]?.count || 0}`)
        await client.end()
        resolve()
      })

      pipeline.on('error', async (error: Error) => {
        console.error('❌ Stream error:', error)
        await client.end()
        reject(error)
      })
    })
  } catch (error) {
    console.error('❌ Error importing boundaries:', error)
    await client.end()
    throw error
  }
}

// Run if called directly
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: tsx lib/db/import-boundaries-stream.ts <path-to-geojson>')
  console.error('Example: tsx lib/db/import-boundaries-stream.ts data/geojson/federal-ridings.geojson')
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
