import * as shapefile from 'shapefile'
import * as fs from 'fs'

/**
 * Convert shapefile to GeoJSON
 * Usage: tsx lib/db/convert-shapefile.ts <path-to-shapefile.shp> [output-path]
 */
async function convertShapefileToGeoJSON(
  shapefilePath: string,
  outputPath?: string
) {
  try {
    console.log(`Reading shapefile: ${shapefilePath}`)

    // Read the shapefile
    const source = await shapefile.open(shapefilePath)
    
    // Determine output path
    const defaultOutputPath = shapefilePath.replace(/\.shp$/i, '.geojson')
    const finalOutputPath = outputPath || defaultOutputPath

    // Write GeoJSON file incrementally to handle large files
    const writeStream = fs.createWriteStream(finalOutputPath)
    writeStream.write('{\n  "type": "FeatureCollection",\n  "features": [\n')

    // Read all features and write incrementally
    let result = await source.read()
    let featureCount = 0
    let firstFeature: GeoJSON.Feature | null = null
    
    while (!result.done) {
      const feature = result.value as GeoJSON.Feature
      
      // Log first feature properties for debugging
      if (featureCount === 0 && feature.properties) {
        firstFeature = feature
        console.log('\n📋 First feature properties:')
        console.log(JSON.stringify(feature.properties, null, 2))
      }
      
      // Write feature (with comma separator except for first)
      if (featureCount > 0) {
        writeStream.write(',\n')
      }
      writeStream.write('    ' + JSON.stringify(feature))
      
      featureCount++
      result = await source.read()
    }

    // Close GeoJSON structure
    writeStream.write('\n  ]\n}')
    writeStream.end()

    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    console.log(`✅ GeoJSON saved to: ${finalOutputPath}`)
    console.log(`   Features: ${featureCount}`)
    console.log(`   Note: Coordinates will be transformed to WGS84 during import`)

    return finalOutputPath
  } catch (error) {
    console.error('❌ Error converting shapefile:', error)
    throw error
  }
}

// Run if called directly
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: tsx lib/db/convert-shapefile.ts <path-to-shapefile.shp> [output-path]')
  console.error('Example: tsx lib/db/convert-shapefile.ts data/shapefiles/ridings.shp data/geojson/ridings.geojson')
  process.exit(1)
}

convertShapefileToGeoJSON(args[0], args[1])
  .then(() => {
    console.log('Conversion completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Conversion failed:', error)
    process.exit(1)
  })
