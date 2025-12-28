#!/usr/bin/env tsx
/**
 * Health check script for local Supabase database
 */

import postgres from 'postgres'

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres'

async function healthCheck() {
  console.log('🔍 Starting database health check...\n')
  console.log(`📡 Connecting to: ${DB_URL.replace(/:[^:@]+@/, ':****@')}\n`)

  const sql = postgres(DB_URL)

  try {
    // 1. Check database connection
    console.log('1️⃣  Testing database connection...')
    const connectionTest = await sql`SELECT version() as version, current_database() as database, current_user as user`
    console.log(`   ✅ Connected successfully`)
    console.log(`   📊 Database: ${connectionTest[0].database}`)
    console.log(`   👤 User: ${connectionTest[0].user}`)
    console.log(`   🗄️  Version: ${connectionTest[0].version.split(' ')[0]} ${connectionTest[0].version.split(' ')[1]}\n`)

    // 2. Check PostGIS extension
    console.log('2️⃣  Checking PostGIS extension...')
    const postgisCheck = await sql`
      SELECT 
        extname as extension_name,
        extversion as version
      FROM pg_extension 
      WHERE extname = 'postgis'
    `
    if (postgisCheck.length > 0) {
      console.log(`   ✅ PostGIS is enabled`)
      console.log(`   📦 Version: ${postgisCheck[0].version}\n`)
    } else {
      console.log(`   ⚠️  PostGIS extension not found\n`)
    }

    // 3. Check table existence and row counts
    console.log('3️⃣  Checking tables and row counts...')
    const expectedTables = [
      'mps',
      'riding_boundaries',
      'votes',
      'bills',
      'expenses',
      'petitions',
      'committee_participation',
      'calculated_scores',
      'scoring_weights',
      'users',
      'email_subscriptions',
    ]

    // Get table sizes from pg_class
    const tableSizes = await sql`
      SELECT 
        schemaname || '.' || tablename as full_name,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = 'public'
    `
    const sizeMap = new Map(tableSizes.map(t => [t.tablename, t.size]))

    for (const tableName of expectedTables) {
      const tableCheck = await sql.unsafe(`SELECT COUNT(*) as row_count FROM ${tableName}`)
      const rowCount = parseInt(tableCheck[0].row_count)
      const size = sizeMap.get(tableName) || 'N/A'
      const status = rowCount >= 0 ? '✅' : '❌'
      console.log(`   ${status} ${tableName.padEnd(25)} ${rowCount.toString().padStart(8)} rows | ${size}`)
    }
    console.log()

    // 4. Check indexes
    console.log('4️⃣  Checking indexes...')
    const indexes = await sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `
    console.log(`   📇 Found ${indexes.length} indexes in public schema`)
    const spatialIndexes = indexes.filter(idx => idx.indexdef.includes('GIST') || idx.indexdef.includes('SPATIAL'))
    if (spatialIndexes.length > 0) {
      console.log(`   🗺️  Spatial indexes:`)
      spatialIndexes.forEach(idx => {
        console.log(`      - ${idx.indexname} on ${idx.tablename}`)
      })
    }
    console.log()

    // 5. Check foreign key constraints
    console.log('5️⃣  Checking foreign key constraints...')
    const foreignKeys = await sql`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name
    `
    console.log(`   🔗 Found ${foreignKeys.length} foreign key constraints`)
    console.log()

    // 6. Check for sample data
    console.log('6️⃣  Checking for sample data...')
    const mpCount = await sql`SELECT COUNT(*) as count FROM mps`
    const voteCount = await sql`SELECT COUNT(*) as count FROM votes`
    const billCount = await sql`SELECT COUNT(*) as count FROM bills`
    const expenseCount = await sql`SELECT COUNT(*) as count FROM expenses`
    const boundaryCount = await sql`SELECT COUNT(*) as count FROM riding_boundaries`

    console.log(`   👥 MPs: ${mpCount[0].count}`)
    console.log(`   🗳️  Votes: ${voteCount[0].count}`)
    console.log(`   📜 Bills: ${billCount[0].count}`)
    console.log(`   💰 Expenses: ${expenseCount[0].count}`)
    console.log(`   🗺️  Riding Boundaries: ${boundaryCount[0].count}`)
    console.log()

    // 7. Check database size
    console.log('7️⃣  Database size information...')
    const dbSize = await sql`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as total_size,
        pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) as table_size
      FROM pg_tables
      WHERE schemaname = 'public'
    `
    console.log(`   💾 Total database size: ${dbSize[0].total_size}`)
    console.log(`   📊 Public schema tables size: ${dbSize[0].table_size || 'N/A'}`)
    console.log()

    // 8. Check for any issues
    console.log('8️⃣  Checking for potential issues...')
    const issues: string[] = []

    if (parseInt(mpCount[0].count) === 0) {
      issues.push('⚠️  No MPs found in database')
    }
    if (parseInt(boundaryCount[0].count) === 0) {
      issues.push('⚠️  No riding boundaries found')
    }

    const missingColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'mps' 
        AND column_name = 'person_id'
    `
    if (missingColumns.length === 0) {
      issues.push('⚠️  Missing person_id column in mps table (may need migration)')
    }

    if (issues.length === 0) {
      console.log('   ✅ No issues detected')
    } else {
      issues.forEach(issue => console.log(`   ${issue}`))
    }
    console.log()

    console.log('✅ Health check completed successfully!')

  } catch (error) {
    console.error('❌ Health check failed:', error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

healthCheck()

