#!/usr/bin/env node

import { run } from 'graphile-worker'
import * as dotenv from 'dotenv'
import { taskList } from './scraper-jobs'
import * as Sentry from '@sentry/node'

// Load environment variables
dotenv.config({ path: '.env.local' })

// Initialize Sentry if SENTRY_DSN is set
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0,
  })
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set')
  process.exit(1)
}

async function main() {
  console.log('🚀 Starting Graphile Worker...')

  const runner = await run({
    connectionString: process.env.DATABASE_URL!,
    concurrency: 5, // Run up to 5 jobs concurrently
    pollInterval: 1000, // Poll every second
    taskList,
    noHandleSignals: false, // Allow graceful shutdown
  })

  console.log('✅ Graphile Worker started successfully')
  console.log('📋 Registered tasks:', Object.keys(taskList).join(', '))

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Graphile Worker...')
    await runner.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down Graphile Worker...')
    await runner.stop()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('❌ Failed to start Graphile Worker:', error)
  Sentry.captureException(error)
  process.exit(1)
})

