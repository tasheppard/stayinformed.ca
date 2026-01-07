import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { scoringWeights } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'

/**
 * Check if the current user is an admin
 * For now, we'll use environment variable to define admin emails
 */
async function isAdmin(userEmail: string | null): Promise<boolean> {
  if (!userEmail) return false

  // Handle case where ADMIN_EMAILS is not set - provide default empty string
  const adminEmailsString = process.env.ADMIN_EMAILS || ''
  const adminEmails = adminEmailsString
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0)
  
  return adminEmails.includes(userEmail.toLowerCase())
}

/**
 * GET /api/admin/scoring-weights
 * Fetch current scoring weights from database
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email || !(await isAdmin(user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const weights = await db
      .select()
      .from(scoringWeights)
      .where(
        or(
          eq(scoringWeights.metricName, 'Legislative Activity'),
          eq(scoringWeights.metricName, 'Fiscal Responsibility'),
          eq(scoringWeights.metricName, 'Constituent Engagement'),
          eq(scoringWeights.metricName, 'Voting Participation')
        )
      )

    // Return weights in a structured format
    const weightsMap: Record<string, any> = {}
    for (const weight of weights) {
      weightsMap[weight.metricName] = {
        id: weight.id,
        value: parseFloat(weight.weightValue.toString()),
        description: weight.description,
        updatedAt: weight.updatedAt,
      }
    }

    return NextResponse.json({ weights: weightsMap })
  } catch (error) {
    console.error('Error fetching scoring weights:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scoring weights' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/scoring-weights
 * Update scoring weights in database
 * Validates that weights sum to 1.0
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email || !(await isAdmin(user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      legislativeActivity,
      fiscalResponsibility,
      constituentEngagement,
      votingParticipation,
    } = body

    // Validate all weights are present and are numbers
    if (
      typeof legislativeActivity !== 'number' ||
      typeof fiscalResponsibility !== 'number' ||
      typeof constituentEngagement !== 'number' ||
      typeof votingParticipation !== 'number'
    ) {
      return NextResponse.json(
        {
          error:
            'All weights must be provided as numbers: legislativeActivity, fiscalResponsibility, constituentEngagement, votingParticipation',
        },
        { status: 400 }
      )
    }

    // Validate weights are between 0 and 1
    const allWeights = [
      { name: 'legislativeActivity', value: legislativeActivity },
      { name: 'fiscalResponsibility', value: fiscalResponsibility },
      { name: 'constituentEngagement', value: constituentEngagement },
      { name: 'votingParticipation', value: votingParticipation },
    ]

    for (const weight of allWeights) {
      if (weight.value < 0 || weight.value > 1) {
        return NextResponse.json(
          {
            error: `${weight.name} must be between 0 and 1 (received: ${weight.value})`,
          },
          { status: 400 }
        )
      }
    }

    // Validate weights sum to 1.0 (allow small floating point errors)
    const total =
      legislativeActivity +
      fiscalResponsibility +
      constituentEngagement +
      votingParticipation

    if (Math.abs(total - 1.0) > 0.01) {
      return NextResponse.json(
        {
          error: `Weights must sum to 1.0 (current sum: ${total.toFixed(3)})`,
          total,
        },
        { status: 400 }
      )
    }

    // Update weights in database using upsert to handle concurrent updates safely
    // This prevents race conditions where two requests might both try to insert the same metric
    const updates = []
    const metricNames = [
      { name: 'Legislative Activity', value: legislativeActivity },
      { name: 'Fiscal Responsibility', value: fiscalResponsibility },
      { name: 'Constituent Engagement', value: constituentEngagement },
      { name: 'Voting Participation', value: votingParticipation },
    ]

    for (const metric of metricNames) {
      // Use upsert (INSERT ... ON CONFLICT DO UPDATE) to atomically handle insert or update
      // This prevents race conditions where concurrent requests might both try to insert
      const result = await db
        .insert(scoringWeights)
        .values({
          metricName: metric.name,
          weightValue: metric.value.toString(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: scoringWeights.metricName, // Unique constraint on metricName
          set: {
            weightValue: metric.value.toString(),
            updatedAt: new Date(),
          },
        })
        .returning()

      updates.push(result[0])
    }

    return NextResponse.json({
      success: true,
      weights: {
        legislativeActivity,
        fiscalResponsibility,
        constituentEngagement,
        votingParticipation,
      },
      updated: updates,
    })
  } catch (error) {
    console.error('Error updating scoring weights:', error)
    return NextResponse.json(
      { error: 'Failed to update scoring weights' },
      { status: 500 }
    )
  }
}

