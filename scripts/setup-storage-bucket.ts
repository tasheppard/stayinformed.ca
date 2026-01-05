/**
 * Script to set up the mp-photos storage bucket in Supabase
 * 
 * This script creates a public storage bucket for MP photos with proper CORS settings.
 * 
 * Usage:
 *   tsx scripts/setup-storage-bucket.ts
 * 
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL environment variable
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })
dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL environment variable is required')
  process.exit(1)
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const BUCKET_NAME = 'mp-photos'

async function setupStorageBucket() {
  console.log(`📦 Setting up storage bucket: ${BUCKET_NAME}...`)

  try {
    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()

    if (listError) {
      throw new Error(`Failed to list buckets: ${listError.message}`)
    }

    const existingBucket = buckets?.find((bucket) => bucket.name === BUCKET_NAME)

    if (existingBucket) {
      console.log(`✅ Bucket "${BUCKET_NAME}" already exists`)
      console.log(`   Public: ${existingBucket.public ? 'Yes' : 'No'}`)
      console.log(`   File size limit: ${existingBucket.file_size_limit || 'Not set'}`)
      
      // Update bucket to ensure it's public
      if (!existingBucket.public) {
        console.log(`\n🔓 Making bucket public...`)
        const { data: updateData, error: updateError } = await supabase.storage.updateBucket(
          BUCKET_NAME,
          {
            public: true,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
          }
        )

        if (updateError) {
          throw new Error(`Failed to update bucket: ${updateError.message}`)
        }

        console.log(`✅ Bucket updated to public`)
      }

      console.log(`\n✅ Bucket setup complete!`)
      return
    }

    // Create new bucket
    console.log(`\n📦 Creating new bucket...`)
    const { data: bucketData, error: createError } = await supabase.storage.createBucket(
      BUCKET_NAME,
      {
        public: true,
        fileSizeLimit: 5242880, // 5MB (enough for compressed 400x400 images)
        allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      }
    )

    if (createError) {
      throw new Error(`Failed to create bucket: ${createError.message}`)
    }

    console.log(`✅ Bucket "${BUCKET_NAME}" created successfully!`)
    console.log(`   Public: Yes`)
    console.log(`   File size limit: 5MB`)
    console.log(`   Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp`)

    // Note: CORS settings need to be configured via Supabase Dashboard
    // Storage > Settings > CORS Configuration
    console.log(`\n⚠️  CORS Configuration:`)
    console.log(`   CORS settings must be configured manually via Supabase Dashboard:`)
    console.log(`   1. Go to Storage > Settings > CORS Configuration`)
    console.log(`   2. Add your frontend domain (e.g., https://stayinformed.ca)`)
    console.log(`   3. Allow methods: GET, HEAD`)
    console.log(`   4. Allow headers: *`)
    console.log(`   5. Max age: 3600`)

    console.log(`\n✅ Bucket setup complete!`)
  } catch (error) {
    console.error(`\n❌ Error setting up storage bucket:`)
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Run the setup
setupStorageBucket()
  .then(() => {
    console.log(`\n✨ Done!`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Fatal error:`, error)
    process.exit(1)
  })

