#!/usr/bin/env tsx
/**
 * Test photo storage integration with a sample MP
 * 
 * Usage:
 *   tsx scripts/test-photo-storage.ts [personId]
 * 
 * If personId is not provided, will use the first active MP with a photo URL
 * 
 * Environment variables:
 *   DATABASE_URL             - Database connection string (required)
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL (required)
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (required)
 */

import * as dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
dotenv.config({ path: '.env.local' })
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' })
}
if (!process.env.DATABASE_URL) {
  const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
  dotenv.config({ path: envFile })
}

async function testPhotoStorage() {
  try {
    console.log('🔍 Testing photo storage integration...\n')

    // Check required environment variables
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable is required')
      console.error('   Make sure your .env.local file contains DATABASE_URL')
      console.error('   Or start Supabase locally: npm run supabase:start')
      process.exit(1)
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('❌ NEXT_PUBLIC_SUPABASE_URL environment variable is required')
      process.exit(1)
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required')
      process.exit(1)
    }

    const { db } = await import('../lib/db/index.js')
    const { mps } = await import('../lib/db/schema.js')
    const { eq, and, isNotNull } = await import('drizzle-orm')
    const { processAndUploadPhoto, getPhotoPublicUrl } = await import('../lib/storage/photo-storage.js')

    // Get personId from command line args or find a sample MP
    const personId = process.argv[2]

    let mp
    if (personId) {
      console.log(`📋 Looking up MP with personId: ${personId}\n`)
      const results = await db
        .select()
        .from(mps)
        .where(and(eq(mps.personId, personId), isNotNull(mps.photoUrl)))
        .limit(1)

      if (results.length === 0) {
        console.error(`❌ No MP found with personId: ${personId} and photo URL`)
        process.exit(1)
      }
      mp = results[0]
    } else {
      console.log('📋 Finding a sample MP with photo URL...\n')
      // Find first active MP with a photo URL
      const results = await db
        .select()
        .from(mps)
        .where(and(eq(mps.isActive, true), isNotNull(mps.photoUrl)))
        .limit(1)

      if (results.length === 0) {
        console.error('❌ No active MPs with photo URLs found in database')
        console.error('   Run MPDetailScraper first to populate photo URLs')
        process.exit(1)
      }
      mp = results[0]
    }

    console.log(`✅ Found MP: ${mp.fullName}`)
    console.log(`   Person ID: ${mp.personId}`)
    console.log(`   Current photo URL: ${mp.photoUrl || '(none)'}`)
    console.log(`   Photo last modified: ${mp.photoLastModified || '(not set)'}\n`)

    if (!mp.photoUrl) {
      console.error('❌ MP does not have a photo URL')
      process.exit(1)
    }

    if (!mp.personId) {
      console.error('❌ MP does not have a personId')
      process.exit(1)
    }

    // Test photo processing
    console.log('🔄 Processing photo...\n')
    const result = await processAndUploadPhoto(
      mp.photoUrl,
      mp.personId,
      mp.photoLastModified || null,
      null, // photoHash not stored in schema currently
      {
        maxWidth: 400,
        maxHeight: 400,
        quality: 85,
        format: 'jpeg',
      }
    )

    if (result.success) {
      if (result.skipped) {
        console.log('✅ Photo processing completed (skipped)')
        console.log(`   Reason: ${result.reason || 'Photo not modified'}`)
        if (result.photoLastModified) {
          console.log(`   Last modified: ${result.photoLastModified}`)
        }
      } else {
        console.log('✅ Photo processing completed successfully!')
        if (result.photoUrl) {
          console.log(`   Uploaded URL: ${result.photoUrl}`)
        }
        if (result.photoLastModified) {
          console.log(`   Last modified: ${result.photoLastModified}`)
        }
        if (result.photoHash) {
          console.log(`   Hash: ${result.photoHash.substring(0, 16)}...`)
        }
      }

      // Verify the public URL can be generated
      console.log('\n🔗 Verifying public URL generation...')
      const publicUrl = getPhotoPublicUrl(mp.personId)
      console.log(`   Public URL: ${publicUrl}`)

      // Check if URL matches expected format
      if (publicUrl.includes(mp.personId) && publicUrl.includes('mp-photos')) {
        console.log('   ✅ Public URL format is correct\n')
      } else {
        console.log('   ⚠️  Public URL format may be incorrect\n')
      }

      console.log('✅ Photo storage integration test completed successfully!\n')
      process.exit(0)
    } else {
      console.error('❌ Photo processing failed:')
      console.error(`   Error: ${result.error}\n`)
      process.exit(1)
    }
  } catch (error) {
    // Check for connection errors in both error message and cause
    let isConnectionError = false
    let errorMessage = ''
    
    if (error instanceof Error) {
      errorMessage = error.message.toLowerCase()
      
      // Check error message
      if (errorMessage.includes('econnrefused') || errorMessage.includes('connection refused')) {
        isConnectionError = true
      }
      
      // Check error cause (DrizzleQueryError wraps connection errors in cause)
      if ((error as any).cause) {
        const cause = (error as any).cause
        const causeMessage = (cause?.message || String(cause) || '').toLowerCase()
        if (causeMessage.includes('econnrefused') || causeMessage.includes('connection refused')) {
          isConnectionError = true
        }
        // Also check for AggregateError with ECONNREFUSED
        if (cause?.code === 'ECONNREFUSED') {
          isConnectionError = true
        }
      }
    }
    
    if (isConnectionError) {
      console.error('\n❌ Database connection failed (ECONNREFUSED)\n')
      console.error('💡 The database is not accessible. Try:')
      console.error('   1. Start Supabase locally: npm run supabase:start')
      console.error('   2. Check DATABASE_URL in .env.local points to the correct database')
      console.error('   3. Verify the database is running and accessible')
      console.error('   4. For local Supabase, ensure it\'s running: supabase status')
      console.error('')
    } else {
      console.error('❌ Error testing photo storage:', error)
      if (error instanceof Error) {
        console.error('   Error message:', error.message)
        if (errorMessage.includes('database') && errorMessage.includes('not found')) {
          console.error('\n💡 Database not found. Check DATABASE_URL in .env.local')
        }
        // Only show stack trace for non-connection errors
        console.error('   Error stack:', error.stack)
      }
    }
    process.exit(1)
  }
}

testPhotoStorage().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

