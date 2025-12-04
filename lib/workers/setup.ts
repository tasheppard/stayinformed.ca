import { run } from 'graphile-worker'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

/**
 * Sets up Graphile Worker schema in the database
 * This creates the necessary tables for job queuing
 */
export async function setupGraphileWorker() {
  console.log('Setting up Graphile Worker schema...')
  
  try {
    // Graphile Worker will automatically create its schema on first run
    // We just need to initialize it with an empty runner
    const runner = await run({
      connectionString: process.env.DATABASE_URL!,
      concurrency: 1,
      noHandleSignals: true,
      pollInterval: 1000,
      taskList: {}, // Empty task list for setup only
    })

    console.log('✅ Graphile Worker schema initialized')
    
    // Stop immediately after setup
    await runner.stop()
    
    return true
  } catch (error) {
    console.error('❌ Failed to setup Graphile Worker:', error)
    throw error
  }
}

// Run setup if called directly
if (require.main === module) {
  setupGraphileWorker()
    .then(() => {
      console.log('Setup complete')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Setup failed:', error)
      process.exit(1)
    })
}

