import * as dotenv from 'dotenv'
import postgres from 'postgres'
import { execSync } from 'child_process'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set')
  process.exit(1)
}

/**
 * Import GeoJSON using ogr2ogr if available, otherwise provide instructions
 */
async function importBoundaries(geojsonPath: string) {
  try {
    console.log(`Importing GeoJSON: ${geojsonPath}`)
    
    // Check if ogr2ogr is available
    try {
      execSync('which ogr2ogr', { stdio: 'ignore' })
      console.log('✅ ogr2ogr found, using it for import...')
      
      // Extract connection details from DATABASE_URL
      const dbUrl = process.env.DATABASE_URL!
      const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/)
      
      if (!urlMatch) {
        throw new Error('Could not parse DATABASE_URL')
      }
      
      const [, user, password, host, port, database] = urlMatch
      
      // Use ogr2ogr to import directly
      const ogrCommand = `ogr2ogr -f "PostgreSQL" \
        "PG:host=${host} port=${port} dbname=${database} user=${user} password=${password}" \
        "${geojsonPath}" \
        -nln riding_boundaries \
        -append \
        -lco GEOMETRY_NAME=geom \
        -lco FID=id \
        -t_srs EPSG:4326 \
        -nlt MULTIPOLYGON`
      
      console.log('Running ogr2ogr...')
      execSync(ogrCommand, { stdio: 'inherit' })
      
      console.log('✅ Import completed using ogr2ogr')
    } catch (ogrError: any) {
      if (ogrError.code === 'ENOENT' || ogrError.message?.includes('which')) {
        console.log('⚠️  ogr2ogr not found. Please install GDAL:')
        console.log('   macOS: brew install gdal')
        console.log('   Ubuntu: sudo apt-get install gdal-bin')
        console.log('\nAlternatively, you can import manually using:')
        console.log(`   ogr2ogr -f "PostgreSQL" "PG:host=HOST dbname=DB user=USER password=PASS" "${geojsonPath}" -nln riding_boundaries`)
        process.exit(1)
      } else {
        throw ogrError
      }
    }
  } catch (error) {
    console.error('❌ Error importing boundaries:', error)
    throw error
  }
}

// Run if called directly
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: tsx lib/db/import-simple.ts <path-to-geojson>')
  process.exit(1)
}

importBoundaries(args[0])
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Import failed:', error)
    process.exit(1)
  })

