import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  mps,
  calculatedScores,
  votes,
  bills,
  expenses,
  petitions,
  committeeParticipation,
} from '@/lib/db/schema'
import { eq, inArray, desc, sql, and, gte } from 'drizzle-orm'
import { getUserWithPremium } from '@/lib/auth/get-user-with-premium'

/**
 * GET /api/mp/compare
 *
 * Query parameters:
 * - mpIds: Comma-separated list of MP IDs to compare (e.g., "1,2,3")
 * - slugs: Comma-separated list of MP slugs to compare (alternative to mpIds)
 *
 * Returns comparison data for multiple MPs including:
 * - MP basic info
 * - Latest scores
 * - Voting statistics
 * - Bills, petitions, committees counts
 * - Expense totals
 *
 * Premium feature - requires authentication and premium subscription
 */
export async function GET(request: NextRequest) {
  try {
    // Check premium status
    const { user, isPremium } = await getUserWithPremium()
    if (!user || !isPremium) {
      return NextResponse.json(
        { error: 'Premium subscription required for MP comparison' },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const mpIdsParam = searchParams.get('mpIds')
    const slugsParam = searchParams.get('slugs')

    let mpIds: number[] = []

    // Parse MP IDs or slugs
    if (mpIdsParam) {
      mpIds = mpIdsParam
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id))
    } else if (slugsParam) {
      const slugs = slugsParam.split(',').map((s) => s.trim())
      const mpResults = await db
        .select({ id: mps.id })
        .from(mps)
        .where(inArray(mps.slug, slugs))

      mpIds = mpResults.map((mp) => mp.id)
    } else {
      return NextResponse.json(
        { error: 'Either mpIds or slugs parameter is required' },
        { status: 400 }
      )
    }

    if (mpIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid MP IDs found' },
        { status: 400 }
      )
    }

    // Limit to 10 MPs for performance
    if (mpIds.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 MPs can be compared at once' },
        { status: 400 }
      )
    }

    // Fetch MP basic info
    const mpList = await db
      .select()
      .from(mps)
      .where(inArray(mps.id, mpIds))

    if (mpList.length === 0) {
      return NextResponse.json(
        { error: 'No MPs found' },
        { status: 404 }
      )
    }

    // Fetch latest scores for each MP
    const allScores = await db
      .select()
      .from(calculatedScores)
      .where(inArray(calculatedScores.mpId, mpIds))
      .orderBy(desc(calculatedScores.calculatedAt))

    // Get most recent score for each MP
    const scoresMap = new Map<number, typeof allScores[0]>()
    for (const score of allScores) {
      if (!scoresMap.has(score.mpId)) {
        scoresMap.set(score.mpId, score)
      }
    }

    // Fetch voting statistics
    const voteStats = await db
      .select({
        mpId: votes.mpId,
        totalVotes: sql<number>`count(*)::int`,
        yeaVotes: sql<number>`count(*) filter (where ${votes.voteResult} = 'Yea')::int`,
        nayVotes: sql<number>`count(*) filter (where ${votes.voteResult} = 'Nay')::int`,
        absentVotes: sql<number>`count(*) filter (where ${votes.voteResult} IN ('Abstained', 'Paired'))::int`,
      })
      .from(votes)
      .where(inArray(votes.mpId, mpIds))
      .groupBy(votes.mpId)

    const voteStatsMap = new Map(
      voteStats.map((stat) => [
        stat.mpId,
        {
          totalVotes: Number(stat.totalVotes),
          yeaVotes: Number(stat.yeaVotes),
          nayVotes: Number(stat.nayVotes),
          absentVotes: Number(stat.absentVotes),
          participationRate:
            Number(stat.totalVotes) > 0
              ? Math.round(
                  ((Number(stat.totalVotes) - Number(stat.absentVotes)) /
                    Number(stat.totalVotes)) *
                    100
                )
              : 0,
        },
      ])
    )

    // Fetch bills count
    const billsCount = await db
      .select({
        mpId: bills.sponsorMpId,
        count: sql<number>`count(*)::int`,
      })
      .from(bills)
      .where(inArray(bills.sponsorMpId, mpIds))
      .groupBy(bills.sponsorMpId)

    const billsMap = new Map(
      billsCount.map((b) => [b.mpId, Number(b.count)])
    )

    // Fetch petitions count
    const petitionsCount = await db
      .select({
        mpId: petitions.sponsorMpId,
        count: sql<number>`count(*)::int`,
      })
      .from(petitions)
      .where(inArray(petitions.sponsorMpId, mpIds))
      .groupBy(petitions.sponsorMpId)

    const petitionsMap = new Map(
      petitionsCount.map((p) => [p.mpId, Number(p.count)])
    )

    // Fetch committee participation
    const committeesCount = await db
      .select({
        mpId: committeeParticipation.mpId,
        count: sql<number>`count(distinct ${committeeParticipation.committeeName})::int`,
        totalMeetings: sql<number>`sum(${committeeParticipation.meetingCount})::int`,
      })
      .from(committeeParticipation)
      .where(inArray(committeeParticipation.mpId, mpIds))
      .groupBy(committeeParticipation.mpId)

    const committeesMap = new Map(
      committeesCount.map((c) => [
        c.mpId,
        {
          count: Number(c.count),
          totalMeetings: Number(c.totalMeetings || 0),
        },
      ])
    )

    // Fetch expense totals (current fiscal year)
    const currentFiscalYear = (() => {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      return month >= 4 ? year : year - 1
    })()

    const expenseTotals = await db
      .select({
        mpId: expenses.mpId,
        total: sql<number>`sum(${expenses.amount})::numeric`,
      })
      .from(expenses)
      .where(
        and(
          inArray(expenses.mpId, mpIds),
          eq(expenses.fiscalYear, currentFiscalYear)
        )
      )
      .groupBy(expenses.mpId)

    const expensesMap = new Map(
      expenseTotals.map((e) => [e.mpId, Number(e.total)])
    )

    // Build comparison data
    const comparisonData = mpList.map((mp) => {
      const score = scoresMap.get(mp.id)
      const voteStat = voteStatsMap.get(mp.id)
      const billsCount = billsMap.get(mp.id) || 0
      const petitionsCount = petitionsMap.get(mp.id) || 0
      const committees = committeesMap.get(mp.id) || { count: 0, totalMeetings: 0 }
      const expenseTotal = expensesMap.get(mp.id) || 0

      return {
        mp: {
          id: mp.id,
          fullName: mp.fullName,
          slug: mp.slug,
          constituencyName: mp.constituencyName,
          province: mp.province,
          caucusShortName: mp.caucusShortName,
          photoUrl: mp.photoUrl,
        },
        scores: score
          ? {
              overallScore: Number(score.overallScore),
              legislativeActivityScore: Number(score.legislativeActivityScore),
              fiscalResponsibilityScore: Number(score.fiscalResponsibilityScore),
              constituentEngagementScore: Number(score.constituentEngagementScore),
              votingParticipationScore: Number(score.votingParticipationScore),
              calculatedAt: score.calculatedAt,
            }
          : null,
        voting: voteStat || {
          totalVotes: 0,
          yeaVotes: 0,
          nayVotes: 0,
          absentVotes: 0,
          participationRate: 0,
        },
        billsSponsored: billsCount,
        petitionsSponsored: petitionsCount,
        committees: committees.count,
        committeeMeetings: committees.totalMeetings,
        expensesTotal: expenseTotal,
      }
    })

    return NextResponse.json({
      comparison: comparisonData,
      count: comparisonData.length,
    })
  } catch (error) {
    console.error('Error in MP comparison API:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

