/**
 * Script to get the local Supabase service_role key
 * 
 * For local Supabase, the service_role key is a JWT that can be generated
 * from the JWT secret. This script tries multiple methods to find it.
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const SUPABASE_URL = 'http://127.0.0.1:54321'

async function findServiceRoleKey() {
  console.log('🔍 Searching for local Supabase service_role key...\n')

  // Method 1: Check Docker containers (Supabase runs in Docker)
  try {
    console.log('📦 Checking Docker containers...')
    const containers = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf-8' })
    const supabaseContainers = containers.split('\n').filter(name => name.includes('supabase'))
    
    if (supabaseContainers.length > 0) {
      console.log(`   Found Supabase containers: ${supabaseContainers.join(', ')}`)
      
      // Try to get JWT secret from auth container
      const authContainer = supabaseContainers.find(name => name.includes('auth'))
      if (authContainer) {
        try {
          const jwtSecret = execSync(
            `docker exec ${authContainer} printenv JWT_SECRET 2>/dev/null || echo ""`,
            { encoding: 'utf-8' }
          ).trim()
          
          if (jwtSecret) {
            console.log('   Found JWT_SECRET in auth container')
            // Note: We'd need to generate the JWT from this secret
            // For now, let's try other methods
          }
        } catch (e) {
          // Ignore
        }
      }
    }
  } catch (e) {
    console.log('   Docker not available or containers not found')
  }

  // Method 2: Check .supabase directory in project
  console.log('\n📁 Checking .supabase directory...')
  const supabaseDirs = [
    path.join(process.cwd(), '.supabase'),
    path.join(process.cwd(), 'supabase', '.temp'),
    path.join(process.cwd(), 'supabase', 'volumes'),
  ]

  for (const dir of supabaseDirs) {
    if (fs.existsSync(dir)) {
      console.log(`   Found: ${dir}`)
      
      // Look for kong.yml
      const kongYml = path.join(dir, 'kong', 'kong.yml')
      if (fs.existsSync(kongYml)) {
        console.log(`   Found kong.yml: ${kongYml}`)
        try {
          const content = fs.readFileSync(kongYml, 'utf-8')
          
          // Look for service_role in various formats
          const patterns = [
            /service_role['":\s]+([^\s'"]+)/i,
            /service_role['":\s]*\n\s*['"]?([^\s'"]+)/i,
            /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
          ]
          
          for (const pattern of patterns) {
            const match = content.match(pattern)
            if (match) {
              const key = match[1] || match[0]
              if (key.startsWith('eyJ')) {
                console.log('\n✅ Found service_role key!')
                console.log('\n' + '='.repeat(60))
                console.log('Add this to your .env.local file:')
                console.log('='.repeat(60))
                console.log(`SUPABASE_SERVICE_ROLE_KEY=${key}`)
                console.log('='.repeat(60) + '\n')
                return
              }
            }
          }
          
          // Also look for JWT_SECRET
          const jwtSecretMatch = content.match(/JWT_SECRET['":\s]+([^\s'"]+)/i)
          if (jwtSecretMatch) {
            console.log(`   Found JWT_SECRET (but need to generate JWT from it)`)
          }
        } catch (e) {
          console.log(`   Error reading file: ${e}`)
        }
      }
      
      // Look for any .env files
      const envFiles = ['/.env', '/.env.local', '/auth/.env']
      for (const envFile of envFiles) {
        const envPath = path.join(dir, envFile)
        if (fs.existsSync(envPath)) {
          console.log(`   Found env file: ${envPath}`)
          try {
            const content = fs.readFileSync(envPath, 'utf-8')
            const serviceRoleMatch = content.match(/SERVICE_ROLE_KEY['"=:\s]+([^\s'"]+)/i)
            if (serviceRoleMatch && serviceRoleMatch[1].startsWith('eyJ')) {
              console.log('\n✅ Found service_role key!')
              console.log('\n' + '='.repeat(60))
              console.log('Add this to your .env.local file:')
              console.log('='.repeat(60))
              console.log(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleMatch[1]}`)
              console.log('='.repeat(60) + '\n')
              return
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }
  }

  // Method 3: Instructions
  console.log('\n❌ Could not find service_role key automatically.\n')
  console.log('💡 Manual methods to get the key:\n')
  
  console.log('   Method 1: Check Supabase Studio')
  console.log('   1. Open: http://127.0.0.1:54323')
  console.log('   2. Look for "Project Settings" or "Settings" in the sidebar')
  console.log('   3. Navigate to "API" or "Keys" section')
  console.log('   4. Find "service_role" key (secret, JWT format starting with "eyJ")\n')
  
  console.log('   Method 2: Check Docker containers')
  console.log('   1. Run: docker ps')
  console.log('   2. Find the Supabase auth container')
  console.log('   3. Run: docker exec <container-name> env | grep JWT')
  console.log('   4. Or check: docker exec <container-name> cat /etc/supabase/.env\n')
  
  console.log('   Method 3: Check .supabase directory')
  console.log('   1. Run: find .supabase -name "*.yml" -o -name "*.env" 2>/dev/null')
  console.log('   2. Search for "service_role" in those files\n')
  
  console.log('   Method 4: Try the "Secret" key from supabase status')
  console.log('   The "Secret" key shown in `supabase status` might work')
  console.log('   but it\'s in a different format. Try using it as:')
  console.log('   SUPABASE_SERVICE_ROLE_KEY=<the-secret-key-from-status>\n')
  
  console.log('   After getting the key, update .env.local and run:')
  console.log('   npx tsx test-storage.ts\n')
}

findServiceRoleKey().catch(console.error)

