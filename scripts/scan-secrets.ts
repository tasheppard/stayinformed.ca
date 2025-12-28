#!/usr/bin/env tsx
/**
 * Secret scanning script for pre-commit hook
 * Scans staged files for common secret patterns
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

// Patterns to search for (case-insensitive)
const SECRET_PATTERNS = [
  // Stripe keys
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Live Secret Key' },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/, name: 'Stripe Test Secret Key' },
  { pattern: /pk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Live Publishable Key' },
  { pattern: /pk_test_[a-zA-Z0-9]{24,}/, name: 'Stripe Test Publishable Key' },
  
  // Supabase keys
  { pattern: /sb-[a-zA-Z0-9_-]{20,}\.supabase\.co/, name: 'Supabase Project URL' },
  { pattern: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}/, name: 'JWT Token (likely Supabase service role key)' },
  
  // Database URLs with credentials
  { pattern: /postgresql:\/\/[^:]+:[^@]+@(?!localhost|127\.0\.0\.1)/, name: 'Production Database URL with credentials' },
  { pattern: /mongodb:\/\/[^:]+:[^@]+@(?!localhost|127\.0\.0\.1)/, name: 'Production MongoDB URL with credentials' },
  
  // API keys
  { pattern: /AIza[0-9A-Za-z_-]{35}/, name: 'Google API Key' },
  { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key ID' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Personal Access Token' },
  { pattern: /gho_[a-zA-Z0-9]{36}/, name: 'GitHub OAuth Token' },
  { pattern: /ghu_[a-zA-Z0-9]{36}/, name: 'GitHub User-to-Server Token' },
  { pattern: /ghs_[a-zA-Z0-9]{36}/, name: 'GitHub Server-to-Server Token' },
  { pattern: /ghr_[a-zA-Z0-9]{36}/, name: 'GitHub Refresh Token' },
  
  // Resend
  { pattern: /re_[a-zA-Z0-9]{32,}/, name: 'Resend API Key' },
  
  // Sentry
  { pattern: /https:\/\/[a-f0-9]{32}@[0-9]+\.ingest\.sentry\.io\/[0-9]+/, name: 'Sentry DSN' },
  
  // Generic patterns (be careful with false positives)
  { pattern: /["']?[a-zA-Z0-9_-]{32,}["']?\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}["']?/, name: 'Potential API Key (long alphanumeric string)' },
]

// Files/directories to exclude from scanning
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'out',
  'build',
  'coverage',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  // Exclude test files that might have test tokens
  '*.test.ts',
  '*.test.tsx',
  '*.spec.ts',
  '*.spec.tsx',
]

// Files that are allowed to have certain patterns (like example URLs)
const ALLOWED_FILES = [
  'scripts/verify-database-url-format.ts', // Has example URLs in console.log
  'scripts/health-check.ts', // Has local dev fallback
]

interface SecretMatch {
  file: string
  line: number
  pattern: string
  match: string
}

function shouldExcludeFile(filePath: string): boolean {
  // Check if file is in allowed list
  if (ALLOWED_FILES.some(allowed => filePath.includes(allowed))) {
    return false // Don't exclude, but we'll check context later
  }
  
  // Check exclude patterns
  return EXCLUDE_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      return regex.test(filePath)
    }
    return filePath.includes(pattern)
  })
}

function isAllowedContext(filePath: string, line: string, match: string): boolean {
  // Allow example URLs in console.log statements
  if (filePath.includes('verify-database-url-format.ts') && line.includes('console.log')) {
    return true
  }
  
  // Allow localhost fallback in health-check.ts
  if (filePath.includes('health-check.ts') && line.includes('localhost:54322')) {
    return true
  }
  
  // Allow if it's clearly a comment or example
  if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('example') || line.includes('placeholder')) {
    return true
  }
  
  return false
}

function scanFile(filePath: string): SecretMatch[] {
  const matches: SecretMatch[] = []
  
  if (shouldExcludeFile(filePath)) {
    return matches
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    
    lines.forEach((line, index) => {
      SECRET_PATTERNS.forEach(({ pattern, name }) => {
        const regex = new RegExp(pattern.source, pattern.flags)
        const lineMatches = line.match(regex)
        
        if (lineMatches) {
          // Check if this is an allowed context
          if (!isAllowedContext(filePath, line, lineMatches[0])) {
            matches.push({
              file: filePath,
              line: index + 1,
              pattern: name,
              match: lineMatches[0].substring(0, 50) + (lineMatches[0].length > 50 ? '...' : ''),
            })
          }
        }
      })
    })
  } catch (error) {
    // Skip files that can't be read (binary files, etc.)
    if (error instanceof Error && !error.message.includes('ENOENT')) {
      console.warn(`Warning: Could not read ${filePath}: ${error.message}`)
    }
  }
  
  return matches
}

function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' })
    return output
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(file => join(process.cwd(), file))
  } catch (error) {
    console.error('Error getting staged files:', error)
    return []
  }
}

function main() {
  console.log('🔍 Scanning staged files for secrets...\n')
  
  const stagedFiles = getStagedFiles()
  
  if (stagedFiles.length === 0) {
    console.log('✅ No staged files to scan')
    process.exit(0)
  }
  
  const allMatches: SecretMatch[] = []
  
  stagedFiles.forEach(file => {
    const matches = scanFile(file)
    allMatches.push(...matches)
  })
  
  if (allMatches.length === 0) {
    console.log('✅ No secrets found in staged files\n')
    process.exit(0)
  }
  
  // Group matches by file
  const matchesByFile = new Map<string, SecretMatch[]>()
  allMatches.forEach(match => {
    const existing = matchesByFile.get(match.file) || []
    existing.push(match)
    matchesByFile.set(match.file, existing)
  })
  
  console.error('❌ SECRETS DETECTED IN STAGED FILES!\n')
  console.error('The following potential secrets were found:\n')
  
  matchesByFile.forEach((matches, file) => {
    const relativePath = file.replace(process.cwd() + '/', '')
    console.error(`📄 ${relativePath}`)
    matches.forEach(match => {
      console.error(`   Line ${match.line}: ${match.pattern}`)
      console.error(`   Match: ${match.match}\n`)
    })
  })
  
  console.error('⚠️  Please remove these secrets before committing.')
  console.error('   Use environment variables instead of hardcoding secrets.\n')
  
  process.exit(1)
}

main()

