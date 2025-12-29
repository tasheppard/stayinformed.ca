#!/usr/bin/env tsx
/**
 * Secret Scanner for Pre-commit Hook
 * Scans staged files for potential secrets before allowing commits
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Secret patterns to detect
const SECRET_PATTERNS = [
  // Stripe keys
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/g, name: 'Stripe Live Secret Key' },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/g, name: 'Stripe Test Secret Key' },
  { pattern: /pk_live_[a-zA-Z0-9]{24,}/g, name: 'Stripe Live Publishable Key' },
  { pattern: /pk_test_[a-zA-Z0-9]{24,}/g, name: 'Stripe Test Publishable Key' },
  
  // Supabase service role keys (high privilege)
  { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ/g, name: 'Supabase Service Role Key' },
  
  // Production database URLs (with credentials, excluding localhost)
  { pattern: /postgresql?:\/\/[^:]+:[^@]+@(?!localhost|127\.0\.0\.1)[^\s"'`]+/g, name: 'Production Database URL' },
  
  // API Keys
  { pattern: /AIza[0-9A-Za-z-_]{35}/g, name: 'Google API Key' },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key ID' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GitHub Personal Access Token' },
  { pattern: /re_[a-zA-Z0-9]{32,}/g, name: 'Resend API Key' },
  { pattern: /https:\/\/[a-f0-9]{32}@[a-z0-9.-]+\.ingest\.sentry\.io\/[0-9]+/g, name: 'Sentry DSN' },
  
  // Generic long alphanumeric strings that look like API keys
  { pattern: /[a-zA-Z0-9_-]{40,}/g, name: 'Potential API Key' },
]

// Files/directories to exclude from scanning
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.next/,
  /out/,
  /build/,
  /coverage/,
  /dist/,
  /package-lock\.json/,
  /yarn\.lock/,
  /pnpm-lock\.yaml/,
  /\.test\.(ts|js|tsx|jsx)$/,
  /\.spec\.(ts|js|tsx|jsx)$/,
  /\.test\.(ts|js|tsx|jsx)$/,
]

// Files that are allowed to have certain patterns (with context)
const ALLOWED_FILES = [
  'scripts/verify-database-url-format.ts', // Example URLs in console.log
  'scripts/health-check.ts', // Local development fallback
  'scripts/psql-production.sh', // Bash regex pattern for parsing URLs, not actual credentials
  'scripts/scan-secrets.ts', // This file itself
]

interface SecretMatch {
  file: string
  line: number
  column: number
  pattern: string
  match: string
  context: string
}

function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
    })
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } catch (error) {
    console.error('Error getting staged files:', error)
    return []
  }
}

function shouldExcludeFile(file: string): boolean {
  // Check exclude patterns
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(file)) {
      return true
    }
  }
  
  // Check allowed files
  if (ALLOWED_FILES.includes(file)) {
    return true
  }
  
  return false
}

function scanFile(file: string): SecretMatch[] {
  const matches: SecretMatch[] = []
  
  if (!existsSync(file)) {
    return matches
  }
  
  try {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    
    for (const secretPattern of SECRET_PATTERNS) {
      let lineIndex = 0
      for (const line of lines) {
        lineIndex++
        
        // Skip if line is a comment (basic check)
        if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
          continue
        }
        
        // Skip if line contains regex patterns (bash =~, regex literals, etc.)
        // These are pattern definitions, not actual secrets
        if (line.includes('=~') || line.includes('RegExp(') || line.includes('/.*/')) {
          continue
        }
        
        const regex = new RegExp(secretPattern.pattern.source, secretPattern.pattern.flags)
        let match: RegExpExecArray | null
        
        while ((match = regex.exec(line)) !== null) {
          const column = match.index + 1
          const matchedText = match[0]
          
          // Extract context (30 chars before and after)
          const contextStart = Math.max(0, match.index - 30)
          const contextEnd = Math.min(line.length, match.index + matchedText.length + 30)
          const context = line.substring(contextStart, contextEnd).trim()
          
          // Mask the secret in the match (show first 8 chars, then ...)
          const maskedMatch =
            matchedText.length > 12
              ? `${matchedText.substring(0, 8)}...${matchedText.substring(matchedText.length - 4)}`
              : '***'
          
          matches.push({
            file,
            line: lineIndex,
            column,
            pattern: secretPattern.name,
            match: maskedMatch,
            context: context.length > 80 ? `${context.substring(0, 77)}...` : context,
          })
        }
      }
    }
  } catch (error) {
    // Skip files that can't be read (binary files, etc.)
  }
  
  return matches
}

function main() {
  console.log('🔍 Scanning staged files for secrets...\n')
  
  const stagedFiles = getStagedFiles()
  
  if (stagedFiles.length === 0) {
    console.log('✅ No staged files to scan.')
    process.exit(0)
  }
  
  // Check for jest.config.js - this conflicts with jest.config.cjs
  const jestConfigJs = stagedFiles.find(f => f === 'jest.config.js')
  if (jestConfigJs) {
    console.error('\n❌ BLOCKED: jest.config.js detected in staged files!\n')
    console.error('   jest.config.js conflicts with jest.config.cjs and will cause Jest to fail.')
    console.error('   This project uses jest.config.cjs for ESM support.')
    console.error('\n   To fix:')
    console.error('   1. Remove jest.config.js: git rm --cached jest.config.js')
    console.error('   2. Ensure jest.config.js is in .gitignore')
    console.error('   3. Only jest.config.cjs should be committed\n')
    process.exit(1)
  }
  
  const allMatches: SecretMatch[] = []
  
  for (const file of stagedFiles) {
    if (shouldExcludeFile(file)) {
      continue
    }
    
    const matches = scanFile(file)
    allMatches.push(...matches)
  }
  
  if (allMatches.length === 0) {
    console.log('✅ No secrets found in staged files.')
    process.exit(0)
  }
  
  // Group matches by file
  const matchesByFile = new Map<string, SecretMatch[]>()
  for (const match of allMatches) {
    if (!matchesByFile.has(match.file)) {
      matchesByFile.set(match.file, [])
    }
    matchesByFile.get(match.file)!.push(match)
  }
  
  console.error('\n❌ SECRETS DETECTED IN STAGED FILES!\n')
  console.error('The following potential secrets were found:\n')
  
  for (const [file, matches] of matchesByFile.entries()) {
    console.error(`📄 ${file}:`)
    for (const match of matches) {
      console.error(`   Line ${match.line}, Col ${match.column}: ${match.pattern}`)
      console.error(`   Match: ${match.match}`)
      console.error(`   Context: ${match.context}\n`)
    }
  }
  
  console.error('⚠️  Commit blocked to prevent secret leakage.')
  console.error('\nIf this is a false positive:')
  console.error('  1. Add the file to ALLOWED_FILES in scripts/scan-secrets.ts')
  console.error('  2. Or use --no-verify to bypass (NOT RECOMMENDED)\n')
  
  process.exit(1)
}

main()

