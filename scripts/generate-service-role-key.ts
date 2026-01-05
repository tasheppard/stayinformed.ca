/**
 * Generate service_role JWT key from JWT secret
 * 
 * For local Supabase, we can generate the service_role key from the JWT secret
 */

import * as crypto from 'crypto'

// JWT secret from Docker container
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const JWT_ISSUER = 'http://127.0.0.1:54321/auth/v1'
const JWT_AUD = 'authenticated'

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generateServiceRoleKey(): string {
  // JWT Header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }

  // JWT Payload for service_role
  const payload = {
    role: 'service_role',
    iss: JWT_ISSUER,
    aud: JWT_AUD,
    exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, // 1 year expiry
    iat: Math.floor(Date.now() / 1000),
  }

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))

  // Create signature
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  // Combine to create JWT
  const jwt = `${encodedHeader}.${encodedPayload}.${signature}`

  return jwt
}

const serviceRoleKey = generateServiceRoleKey()

console.log('✅ Generated service_role key!\n')
console.log('='.repeat(60))
console.log('Add this to your .env.local file:')
console.log('='.repeat(60))
console.log(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`)
console.log('='.repeat(60))
console.log('\n💡 This key is valid for local Supabase development.')
console.log('   If you restart Supabase, you may need to regenerate it.\n')

