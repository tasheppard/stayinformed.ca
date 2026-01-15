import { db } from '../db'
import { scoringWeights } from '../db/schema'
import { eq, or } from 'drizzle-orm'

export interface ScoringWeights {
  legislativeActivity: number
  fiscalResponsibility: number
  constituentEngagement: number
  votingParticipation: number
}

/**
 * Default scoring weights (used as fallback if not in database)
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  legislativeActivity: 0.35,
  fiscalResponsibility: 0.25,
  constituentEngagement: 0.25,
  votingParticipation: 0.15,
}

/**
 * Load scoring weights from database
 * 
 * IMPORTANT: Either all 4 weights must exist in the database, or none.
 * Mixing database weights with defaults can cause the total to not sum to 1.0,
 * which would produce incorrectly scaled composite scores.
 * 
 * Falls back to default weights if not all weights are found in database.
 */
export async function getScoringWeights(): Promise<ScoringWeights> {
  try {
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

    // Require all 4 weights to be present in database
    // If any are missing, use all defaults to ensure weights sum to 1.0
    if (weights.length === 0) {
      console.warn('No scoring weights found in database, using defaults')
      return DEFAULT_WEIGHTS
    }

    if (weights.length !== 4) {
      console.warn(
        `Only ${weights.length} of 4 scoring weights found in database. ` +
        `Using all defaults to ensure weights sum to 1.0. ` +
        `Please ensure all 4 weights are present in the database.`
      )
      return DEFAULT_WEIGHTS
    }

    const weightsMap: Partial<ScoringWeights> = {}
    for (const weight of weights) {
      const value = parseFloat(weight.weightValue.toString())
      switch (weight.metricName) {
        case 'Legislative Activity':
          weightsMap.legislativeActivity = value
          break
        case 'Fiscal Responsibility':
          weightsMap.fiscalResponsibility = value
          break
        case 'Constituent Engagement':
          weightsMap.constituentEngagement = value
          break
        case 'Voting Participation':
          weightsMap.votingParticipation = value
          break
      }
    }

    // Verify all 4 weights are present
    if (
      weightsMap.legislativeActivity === undefined ||
      weightsMap.fiscalResponsibility === undefined ||
      weightsMap.constituentEngagement === undefined ||
      weightsMap.votingParticipation === undefined
    ) {
      console.warn(
        'Not all scoring weights found in database. Using all defaults to ensure weights sum to 1.0.'
      )
      return DEFAULT_WEIGHTS
    }

    // Verify weights sum to approximately 1.0 (allow small floating point errors)
    const total =
      weightsMap.legislativeActivity! +
      weightsMap.fiscalResponsibility! +
      weightsMap.constituentEngagement! +
      weightsMap.votingParticipation!

    if (Math.abs(total - 1.0) > 0.01) {
      console.warn(
        `Scoring weights in database sum to ${total.toFixed(3)}, not 1.0. ` +
        `Using defaults to ensure correct scaling.`
      )
      return DEFAULT_WEIGHTS
    }

    return {
      legislativeActivity: weightsMap.legislativeActivity!,
      fiscalResponsibility: weightsMap.fiscalResponsibility!,
      constituentEngagement: weightsMap.constituentEngagement!,
      votingParticipation: weightsMap.votingParticipation!,
    }
  } catch (error) {
    console.error('Error loading scoring weights from database:', error)
    return DEFAULT_WEIGHTS
  }
}

