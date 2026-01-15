import { run } from 'graphile-worker'
import * as dotenv from 'dotenv'
import { taskList as scraperTaskList } from './scraper-jobs'
import { taskList as emailTaskList } from './email-jobs'

// Merge task lists
const taskList = {
  ...scraperTaskList,
  ...emailTaskList,
}

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

/**
 * Start Graphile Worker to process scheduled jobs
 * This should run as a long-running process (e.g., on Railway)
 */
async function startWorker() {
  console.log('Starting Graphile Worker...')
  console.log('Registered tasks:', Object.keys(taskList).join(', '))

  const runner = await run({
    connectionString: process.env.DATABASE_URL!,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10),
    noHandleSignals: true, // Disable Graphile Worker's signal handlers - we handle them ourselves
    pollInterval: 1000,
    taskList,
  })

  console.log('✅ Graphile Worker started and ready to process jobs')
  console.log('Press Ctrl+C to stop')

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...')
    try {
      await runner.stop()
    } catch (error) {
      console.error('Error stopping runner:', error)
    }
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...')
    try {
      await runner.stop()
    } catch (error) {
      console.error('Error stopping runner:', error)
    }
    process.exit(0)
  })
}

// Start worker if called directly
if (require.main === module) {
  startWorker().catch((error) => {
    console.error('Failed to start worker:', error)
    process.exit(1)
  })
}
