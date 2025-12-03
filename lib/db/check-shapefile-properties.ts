import * as dbf from 'dbf'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Check properties in shapefile DBF file
 */
async function checkProperties(dbfPath: string) {
  try {
    console.log(`Reading DBF file: ${dbfPath}`)
    const stream = fs.createReadStream(dbfPath)
    const parser = dbf.stream(stream)

    let recordCount = 0
    let firstRecord: any = null

    parser.on('header', (header: any) => {
      console.log('\n📋 DBF Header:')
      console.log('Fields:', header.fields.map((f: any) => `${f.name} (${f.type})`).join(', '))
    })

    parser.on('record', (record: any) => {
      recordCount++
      if (!firstRecord) {
        firstRecord = record
      }
    })

    parser.on('end', () => {
      console.log(`\n📊 Total records: ${recordCount}`)
      if (firstRecord) {
        console.log('\n📝 First record properties:')
        console.log(JSON.stringify(firstRecord, null, 2))
      }
    })

    parser.on('error', (error: Error) => {
      console.error('Error reading DBF:', error)
    })
  } catch (error) {
    console.error('Error:', error)
  }
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: tsx lib/db/check-shapefile-properties.ts <path-to-dbf>')
  process.exit(1)
}

checkProperties(args[0])

