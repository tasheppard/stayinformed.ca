import * as dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { scoringWeights } from './schema'

// Load environment variables
dotenv.config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = postgres(process.env.DATABASE_URL)
const db = drizzle(client)

export async function seedScoringWeights() {
  const defaultWeights = [
    {
      metricName: 'Legislative Activity',
      weightValue: '0.35',
      description: 'Measures bills sponsored, committee participation, and legislative initiatives',
    },
    {
      metricName: 'Fiscal Responsibility',
      weightValue: '0.25',
      description: 'Evaluates expense management and fiscal accountability',
    },
    {
      metricName: 'Constituent Engagement',
      weightValue: '0.25',
      description: 'Tracks petitions sponsored and constituent outreach activities',
    },
    {
      metricName: 'Voting Participation',
      weightValue: '0.15',
      description: 'Measures voting attendance and participation rate',
    },
  ]

  for (const weight of defaultWeights) {
    await db
      .insert(scoringWeights)
      .values(weight)
      .onConflictDoUpdate({
        target: scoringWeights.metricName,
        set: {
          weightValue: weight.weightValue,
          description: weight.description,
          updatedAt: new Date(),
        },
      })
  }

  console.log('✅ Scoring weights seeded successfully')
}

// Run if called directly
seedScoringWeights()
  .then(async () => {
    console.log('Seed completed')
    await client.end()
    process.exit(0)
  })
  .catch(async (error) => {
    console.error('Seed failed:', error)
    await client.end()
    process.exit(1)
  })

