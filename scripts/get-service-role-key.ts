/**
 * Helper script to get the local Supabase service_role key
 * 
 * This script tries multiple methods to find the service_role key:
 * 1. Check Supabase Studio API
 * 2. Check .supabase directory
 * 3. Provide instructions
 */

import * as fs from 'fs'
import * as path from 'path'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const STUDIO_URL = 'http://127.0.0.1:54323'

async function findServiceRoleKey() {
  console.log('🔍 Searching for local Supabase service_role key...\n')

  // Method 1: Check .supabase directory
  const possiblePaths = [
    path.join(process.cwd(), '.supabase', 'kong', 'kong.yml'),
    path.join(process.cwd(), '.supabase', 'volumes', 'kong', 'kong.yml'),
    path.join(process.cwd(), 'supabase', '.temp', 'kong.yml'),
  ]

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      console.log(`📁 Found config file: ${filePath}`)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        
        // Look for service_role key in YAML
        const serviceRoleMatch = content.match(/service_role['":\s]+([^\s'"]+)/i)
        if (serviceRoleMatch) {
          console.log('\n✅ Found service_role key!')
          console.log('\n' + '='.repeat(60))
          console.log('Add this to your .env.local file:')
          console.log('='.repeat(60))
          console.log(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleMatch[1]}`)
          console.log('='.repeat(60) + '\n')
          return
        }
      } catch (error) {
        console.log(`   Could not read file: ${error}`)
      }
    }
  }

  // Method 2: Instructions
  console.log('❌ Could not find service_role key automatically.\n')
  console.log('💡 To get the service_role key manually:\n')
  console.log('   Option 1: Supabase Studio (Recommended)')
  console.log('   1. Open: http://127.0.0.1:54323')
  console.log('   2. Go to: Settings > API')
  console.log('   3. Find "service_role" key (secret)')
  console.log('   4. Copy the JWT token (starts with "eyJ")')
  console.log('   5. Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=<the-key>\n')
  
  console.log('   Option 2: Check Supabase config')
  console.log('   1. Run: find .supabase -name "kong.yml" 2>/dev/null')
  console.log('   2. Open the file and search for "service_role"')
  console.log('   3. Copy the JWT token value\n')
  
  console.log('   Option 3: Use the anon key (may not work for storage)')
  console.log('   The anon key from supabase status might work for some operations')
  console.log('   but service_role is required for storage bucket management.\n')
}

findServiceRoleKey().catch(console.error)

