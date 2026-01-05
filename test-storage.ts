import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

console.log('URL =', url)
console.log('KEY prefix =', key?.slice(0, 40) || 'MISSING')

const isLocalSupabase = url?.includes('127.0.0.1') || url?.includes('localhost')

if (!key) {
  console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY is not set!')
  if (isLocalSupabase) {
    console.error('\n💡 To get the LOCAL service role key:')
    console.error('   1. Run: supabase status')
    console.error('   2. Look for "service_role key" in the output')
    console.error('   3. Copy that key to .env.local as SUPABASE_SERVICE_ROLE_KEY')
    console.error('   4. Or check Supabase Studio at http://127.0.0.1:54323')
  }
  process.exit(1)
}

// Validate key format
if (!key.startsWith('eyJ')) {
  console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY appears invalid (should start with "eyJ")')
  process.exit(1)
}

// Try to decode JWT to check role
try {
  const keyParts = key.split('.')
  if (keyParts.length === 3) {
    const payload = JSON.parse(Buffer.from(keyParts[1], 'base64').toString())
    console.log('Key role =', payload.role || 'unknown')
    if (payload.role !== 'service_role') {
      console.warn('⚠️  Warning: Key does not appear to be a service_role key')
    }
  }
} catch (e) {
  console.warn('⚠️  Could not decode JWT payload')
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

;(async () => {
  console.log('\n🔍 Testing storage connection...')
  const { data, error } = await supabase.storage.listBuckets()
  
  if (error) {
    console.error('\n❌ ERROR =', error)
    
    if (error.message.includes('signature verification failed')) {
      console.error('\n💡 Troubleshooting:')
      
      if (isLocalSupabase) {
        console.error('   For LOCAL Supabase:')
        console.error('   1. Make sure Supabase is running: supabase start')
        console.error('   2. Get the LOCAL service_role key:')
        console.error('      - Run: supabase status')
        console.error('      - Look for "service_role key" in the output')
        console.error('      - Or check: http://127.0.0.1:54323 (Supabase Studio)')
        console.error('   3. The LOCAL service_role key is DIFFERENT from production')
        console.error('   4. Update SUPABASE_SERVICE_ROLE_KEY in .env.local with the LOCAL key')
        console.error('\n   The key should look like: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
      } else {
        console.error('   1. Verify SUPABASE_SERVICE_ROLE_KEY matches your Supabase project')
        console.error('   2. Make sure you\'re using the service_role key (not anon key)')
        console.error('   3. Check Supabase Dashboard > Settings > API')
        console.error('   4. Verify NEXT_PUBLIC_SUPABASE_URL matches the project for this key')
      }
    }
    process.exit(1)
  }
  
  console.log('✅ SUCCESS! Storage connection works')
  console.log('DATA =', data)
  console.log(`\nFound ${data?.length || 0} bucket(s):`)
  data?.forEach(bucket => {
    console.log(`  - ${bucket.name} (public: ${bucket.public ? 'Yes' : 'No'})`)
  })
})()
