import { db } from '../db'
import {
  mps,
  votes,
  bills,
  expenses,
  petitions,
  committeeParticipation,
  calculatedScores,
} from '../db/schema'
import { eq, and, sql, gte, lte, count, sum, avg, isNull, or } from 'drizzle-orm'
import { getScoringWeights } from './scoring-weights'

export interface MPScore {
  mpId: number
  overallScore: number
  legislativeActivityScore: number
  fiscalResponsibilityScore: number
  constituentEngagementScore: number
  votingParticipationScore: number
}

/**
 * Calculate Legislative Activity Score (35% weight)
 * Based on:
 * - Number of bills sponsored (current session)
 * - Number of petitions sponsored (current session)
 * - Committee participation (active memberships, leadership roles)
 */
export async function calculateLegislativeActivityScore(mpId: number): Promise<number> {
  // Get current session (45th Parliament started in 2021, but we'll use a more flexible approach)
  // For now, we'll use data from the last 2 years as "current session"
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const now = new Date()

  // Count bills sponsored in current session
  const billsSponsored = await db
    .select({ count: count() })
    .from(bills)
    .where(
      and(
        eq(bills.sponsorMpId, mpId),
        sql`${bills.introductionDate} IS NOT NULL`,
        gte(bills.introductionDate, twoYearsAgo)
      )
    )

  const billsCount = billsSponsored[0]?.count || 0

  // Count petitions sponsored in current session
  const petitionsSponsored = await db
    .select({ count: count() })
    .from(petitions)
    .where(
      and(
        eq(petitions.sponsorMpId, mpId),
        sql`${petitions.presentedDate} IS NOT NULL`,
        gte(petitions.presentedDate, twoYearsAgo)
      )
    )

  const petitionsCount = petitionsSponsored[0]?.count || 0

  // Count active committee memberships
  const activeCommittees = await db
    .select({ count: count() })
    .from(committeeParticipation)
    .where(
      and(
        eq(committeeParticipation.mpId, mpId),
        or(
          isNull(committeeParticipation.endDate),
          gte(committeeParticipation.endDate, now)
        )
      )
    )

  const committeesCount = activeCommittees[0]?.count || 0

  // Count leadership roles (Chair, Vice-Chair)
  const leadershipRoles = await db
    .select({ count: count() })
    .from(committeeParticipation)
    .where(
      and(
        eq(committeeParticipation.mpId, mpId),
        sql`(${committeeParticipation.role} = 'Chair' OR ${committeeParticipation.role} = 'Vice-Chair')`,
        or(
          isNull(committeeParticipation.endDate),
          gte(committeeParticipation.endDate, now)
        )
      )
    )

  const leadershipCount = leadershipRoles[0]?.count || 0

  // Calculate raw score components
  // Bills: 0-10 points (max 10 bills = 100 points)
  const billsScore = Math.min(billsCount * 10, 100)

  // Petitions: 0-10 points (max 10 petitions = 100 points)
  const petitionsScore = Math.min(petitionsCount * 10, 100)

  // Committees: 0-30 points (max 3 committees = 100 points)
  const committeesScore = Math.min(committeesCount * 33.33, 100)

  // Leadership: 0-50 points bonus (max 2 leadership roles = 100 points)
  const leadershipScore = Math.min(leadershipCount * 50, 100)

  // Weighted average: bills (30%), petitions (20%), committees (30%), leadership (20%)
  const rawScore =
    billsScore * 0.3 +
    petitionsScore * 0.2 +
    committeesScore * 0.3 +
    leadershipScore * 0.2

  // Normalize to 0-100 scale
  return Math.round(Math.min(Math.max(rawScore, 0), 100))
}

/**
 * Calculate Fiscal Responsibility Score (25% weight)
 * Based on:
 * - Total expenses compared to party average
 * - Total expenses compared to national average
 * Lower expenses = higher score
 */
export async function calculateFiscalResponsibilityScore(mpId: number): Promise<number> {
  // Get current fiscal year
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const fiscalYearStart = new Date(currentYear, 3, 1) // April 1st
  const fiscalYear = currentDate >= fiscalYearStart ? currentYear : currentYear - 1

  // Get MP's total expenses for current fiscal year
  const mpExpenses = await db
    .select({ total: sum(expenses.amount) })
    .from(expenses)
    .where(
      and(
        eq(expenses.mpId, mpId),
        eq(expenses.fiscalYear, fiscalYear)
      )
    )

  const mpTotal = parseFloat(mpExpenses[0]?.total?.toString() || '0')

  // Get MP's party
  const mpData = await db
    .select({ caucusShortName: mps.caucusShortName })
    .from(mps)
    .where(eq(mps.id, mpId))
    .limit(1)

  const mpParty = mpData[0]?.caucusShortName

  // Get party average expenses
  // Calculate average of MP totals (not average of individual transactions)
  // This ensures we compare MP totals to average MP totals
  let partyAverage = 0
  if (mpParty) {
    // Use subquery to first sum expenses per MP, then average those sums
    const partyExpenses = await db.execute(sql`
      SELECT AVG(mp_total) as avg_total
      FROM (
        SELECT mp_id, SUM(amount::numeric) as mp_total
        FROM expenses
        INNER JOIN mps ON expenses.mp_id = mps.id
        WHERE mps.caucus_short_name = ${mpParty}
          AND expenses.fiscal_year = ${fiscalYear}
        GROUP BY mp_id
      ) as mp_totals
    `)

    partyAverage = parseFloat((partyExpenses[0] as { avg_total: string | null })?.avg_total || '0')
  }

  // Get national average expenses
  // Calculate average of MP totals (not average of individual transactions)
  // This ensures we compare MP totals to average MP totals
  const nationalExpenses = await db.execute(sql`
    SELECT AVG(mp_total) as avg_total
    FROM (
      SELECT mp_id, SUM(amount::numeric) as mp_total
      FROM expenses
      WHERE fiscal_year = ${fiscalYear}
      GROUP BY mp_id
    ) as mp_totals
  `)

  const nationalAverage = parseFloat((nationalExpenses[0] as { avg_total: string | null })?.avg_total || '0')

  // Calculate score based on how much lower expenses are compared to averages
  // If MP has no expenses, give them a score of 50 (neutral)
  if (mpTotal === 0) {
    return 50
  }

  // Use the lower of party or national average as baseline (more lenient)
  // Prioritize available data: if only one average is available (> 0), use it
  // If both are available, use the lower one
  let baseline = 0
  if (partyAverage > 0 && nationalAverage > 0) {
    // Both available: use the lower one (more lenient)
    baseline = partyAverage < nationalAverage ? partyAverage : nationalAverage
  } else if (partyAverage > 0) {
    // Only party average available
    baseline = partyAverage
  } else if (nationalAverage > 0) {
    // Only national average available
    baseline = nationalAverage
  }

  if (baseline === 0) {
    return 50 // No baseline data, return neutral score
  }

  // Calculate percentage difference
  // If MP spends less than baseline, score increases
  // If MP spends more than baseline, score decreases
  const difference = ((baseline - mpTotal) / baseline) * 100

  // Normalize: -50% to +50% maps to 0-100
  // MP spending 50% less than average = 100 points
  // MP spending same as average = 50 points
  // MP spending 50% more than average = 0 points
  const rawScore = 50 + difference

  return Math.round(Math.min(Math.max(rawScore, 0), 100))
}

/**
 * Calculate Constituent Engagement Score (25% weight)
 * Based on:
 * - Petitions sponsored (higher signature counts = higher score)
 * - Committee participation (meeting attendance)
 */
export async function calculateConstituentEngagementScore(mpId: number): Promise<number> {
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  // Get petitions with signature counts
  const petitionsData = await db
    .select({
      signatureCount: petitions.signatureCount,
    })
    .from(petitions)
    .where(
      and(
        eq(petitions.sponsorMpId, mpId),
        sql`${petitions.presentedDate} IS NOT NULL`,
        gte(petitions.presentedDate, twoYearsAgo)
      )
    )

  // Calculate petition score based on total signatures
  const totalSignatures = petitionsData.reduce(
    (sum, p) => sum + (p.signatureCount || 0),
    0
  )

  // Max score for petitions: 100 points for 10,000+ signatures
  const petitionScore = Math.min((totalSignatures / 10000) * 100, 100)

  // Get committee meeting attendance
  const now = new Date()
  const committees = await db
    .select({
      meetingCount: committeeParticipation.meetingCount,
    })
    .from(committeeParticipation)
    .where(
      and(
        eq(committeeParticipation.mpId, mpId),
        or(
          isNull(committeeParticipation.endDate),
          gte(committeeParticipation.endDate, now)
        )
      )
    )

  const totalMeetings = committees.reduce((sum, c) => sum + (c.meetingCount || 0), 0)

  // Max score for meetings: 100 points for 50+ meetings
  const meetingScore = Math.min((totalMeetings / 50) * 100, 100)

  // Weighted average: petitions (60%), meetings (40%)
  const rawScore = petitionScore * 0.6 + meetingScore * 0.4

  return Math.round(Math.min(Math.max(rawScore, 0), 100))
}

/**
 * Calculate Voting Participation Score (15% weight)
 * Based on:
 * - Percentage of votes attended (Yea + Nay) vs Absent/Abstained
 */
export async function calculateVotingParticipationScore(mpId: number): Promise<number> {
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  // Get all votes for this MP in current session
  const allVotes = await db
    .select({
      voteResult: votes.voteResult,
    })
    .from(votes)
    .where(
      and(
        eq(votes.mpId, mpId),
        gte(votes.date, twoYearsAgo)
      )
    )

  if (allVotes.length === 0) {
    return 0 // No votes = 0 score
  }

  // Count attended votes (Yea or Nay)
  const attendedVotes = allVotes.filter(
    (v) => v.voteResult === 'Yea' || v.voteResult === 'Nay'
  ).length

  // Calculate attendance percentage
  const attendanceRate = (attendedVotes / allVotes.length) * 100

  // Score is directly the attendance rate (0-100%)
  return Math.round(Math.min(Math.max(attendanceRate, 0), 100))
}

/**
 * Calculate composite score from all sub-scores
 * Uses weighted average based on scoring weights from database
 */
export async function calculateCompositeScore(
  legislativeActivity: number,
  fiscalResponsibility: number,
  constituentEngagement: number,
  votingParticipation: number
): Promise<number> {
  const weights = await getScoringWeights()

  const composite =
    legislativeActivity * weights.legislativeActivity +
    fiscalResponsibility * weights.fiscalResponsibility +
    constituentEngagement * weights.constituentEngagement +
    votingParticipation * weights.votingParticipation

  return Math.round(Math.min(Math.max(composite, 0), 100))
}

/**
 * Calculate all scores for a single MP
 */
export async function calculateMPScores(mpId: number): Promise<MPScore> {
  const [
    legislativeActivityScore,
    fiscalResponsibilityScore,
    constituentEngagementScore,
    votingParticipationScore,
  ] = await Promise.all([
    calculateLegislativeActivityScore(mpId),
    calculateFiscalResponsibilityScore(mpId),
    calculateConstituentEngagementScore(mpId),
    calculateVotingParticipationScore(mpId),
  ])

  const overallScore = await calculateCompositeScore(
    legislativeActivityScore,
    fiscalResponsibilityScore,
    constituentEngagementScore,
    votingParticipationScore
  )

  return {
    mpId,
    overallScore,
    legislativeActivityScore,
    fiscalResponsibilityScore,
    constituentEngagementScore,
    votingParticipationScore,
  }
}

/**
 * Calculate scores for all active MPs
 */
export async function calculateAllMPScores(): Promise<MPScore[]> {
  const activeMPs = await db
    .select({ id: mps.id })
    .from(mps)
    .where(eq(mps.isActive, true))

  const scores: MPScore[] = []

  for (const mp of activeMPs) {
    try {
      const score = await calculateMPScores(mp.id)
      scores.push(score)
    } catch (error) {
      console.error(`Error calculating scores for MP ${mp.id}:`, error)
      // Continue with other MPs even if one fails
    }
  }

  return scores
}

/**
 * Save calculated scores to database
 * Always inserts new records to maintain historical score data.
 * The API endpoint retrieves the most recent score using orderBy(desc(calculatedAt)).limit(1)
 */
export async function saveScores(scores: MPScore[]): Promise<void> {
  for (const score of scores) {
    try {
      // Always insert a new score record to maintain historical data
      // This allows time-series analysis and preserves calculation history
      await db.insert(calculatedScores).values({
        mpId: score.mpId,
        overallScore: score.overallScore.toString(),
        legislativeActivityScore: score.legislativeActivityScore.toString(),
        fiscalResponsibilityScore: score.fiscalResponsibilityScore.toString(),
        constituentEngagementScore: score.constituentEngagementScore.toString(),
        votingParticipationScore: score.votingParticipationScore.toString(),
        calculatedAt: new Date(),
      })
    } catch (error) {
      console.error(`Error saving score for MP ${score.mpId}:`, error)
      // Continue with other scores even if one fails
    }
  }
}

