import { db } from '@/lib/db'
import {
  mps,
  votes,
  bills,
  petitions,
  committeeParticipation,
} from '@/lib/db/schema'
import { eq, sql, and, isNotNull, inArray } from 'drizzle-orm'

interface ComparisonStats {
  votingParticipationRate: number
  billsPerMP: number
  petitionsPerMP: number
  committeesPerMP: number
  committeeMeetingsPerMP: number
}

/**
 * Calculate party averages for comparison metrics
 */
export async function calculatePartyAverages(
  partyName: string | null
): Promise<ComparisonStats | null> {
  if (!partyName) {
    return null
  }

  // Get all MPs in the same party
  const partyMPs = await db
    .select({ id: mps.id })
    .from(mps)
    .where(eq(mps.caucusShortName, partyName))

  if (partyMPs.length === 0) {
    return null
  }

  const partyMPIds = partyMPs.map((mp) => mp.id)

  // Calculate voting participation rate
  const votingStats = await db
    .select({
      totalVotes: sql<number>`COUNT(*)::int`,
      participatedVotes: sql<number>`COUNT(*) FILTER (WHERE ${votes.voteResult} NOT IN ('Abstained', 'Paired'))::int`,
    })
    .from(votes)
    .where(inArray(votes.mpId, partyMPIds))

  const votingParticipationRate =
    votingStats[0]?.totalVotes > 0
      ? Math.round(
          ((votingStats[0]?.participatedVotes || 0) /
            (votingStats[0]?.totalVotes || 1)) *
            100
        )
      : 0

  // Calculate bills per MP
  const billsCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(bills)
    .where(inArray(bills.sponsorMpId, partyMPIds))

  const billsPerMP =
    partyMPIds.length > 0
      ? Math.round((billsCount[0]?.count || 0) / partyMPIds.length)
      : 0

  // Calculate petitions per MP
  const petitionsCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(petitions)
    .where(inArray(petitions.sponsorMpId, partyMPIds))

  const petitionsPerMP =
    partyMPIds.length > 0
      ? Math.round((petitionsCount[0]?.count || 0) / partyMPIds.length)
      : 0

  // Calculate committees per MP
  const committeesCount = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${committeeParticipation.committeeName})::int` })
    .from(committeeParticipation)
    .where(inArray(committeeParticipation.mpId, partyMPIds))

  const committeesPerMP =
    partyMPIds.length > 0
      ? Math.round((committeesCount[0]?.count || 0) / partyMPIds.length)
      : 0

  // Calculate committee meetings per MP
  const meetingsStats = await db
    .select({
      totalMeetings: sql<number>`COALESCE(SUM(${committeeParticipation.meetingCount}), 0)::int`,
    })
    .from(committeeParticipation)
    .where(inArray(committeeParticipation.mpId, partyMPIds))

  const committeeMeetingsPerMP =
    partyMPIds.length > 0
      ? Math.round((meetingsStats[0]?.totalMeetings || 0) / partyMPIds.length)
      : 0

  return {
    votingParticipationRate,
    billsPerMP,
    petitionsPerMP,
    committeesPerMP,
    committeeMeetingsPerMP,
  }
}

/**
 * Calculate national averages for comparison metrics
 */
export async function calculateNationalAverages(): Promise<ComparisonStats> {
  // Get total number of MPs
  const totalMPs = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(mps)

  const mpCount = totalMPs[0]?.count || 1

  // Calculate voting participation rate
  const votingStats = await db
    .select({
      totalVotes: sql<number>`COUNT(*)::int`,
      participatedVotes: sql<number>`COUNT(*) FILTER (WHERE ${votes.voteResult} NOT IN ('Abstained', 'Paired'))::int`,
    })
    .from(votes)

  const votingParticipationRate =
    votingStats[0]?.totalVotes > 0
      ? Math.round(
          ((votingStats[0]?.participatedVotes || 0) /
            (votingStats[0]?.totalVotes || 1)) *
            100
        )
      : 0

  // Calculate bills per MP
  const billsCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(bills)

  const billsPerMP = Math.round((billsCount[0]?.count || 0) / mpCount)

  // Calculate petitions per MP
  const petitionsCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(petitions)

  const petitionsPerMP = Math.round((petitionsCount[0]?.count || 0) / mpCount)

  // Calculate committees per MP
  const committeesCount = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${committeeParticipation.committeeName})::int` })
    .from(committeeParticipation)

  const committeesPerMP = Math.round((committeesCount[0]?.count || 0) / mpCount)

  // Calculate committee meetings per MP
  const meetingsStats = await db
    .select({
      totalMeetings: sql<number>`COALESCE(SUM(${committeeParticipation.meetingCount}), 0)::int`,
    })
    .from(committeeParticipation)

  const committeeMeetingsPerMP = Math.round(
    (meetingsStats[0]?.totalMeetings || 0) / mpCount
  )

  return {
    votingParticipationRate,
    billsPerMP,
    petitionsPerMP,
    committeesPerMP,
    committeeMeetingsPerMP,
  }
}

