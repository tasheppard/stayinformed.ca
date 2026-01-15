import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { calculatedScores, mps } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

/**
 * GET /api/scores
 * 
 * Query parameters:
 * - mpId: Get scores for a specific MP by ID
 * - slug: Get scores for a specific MP by slug
 * 
 * Returns accountability scores for MP(s)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const mpIdParam = searchParams.get('mpId')
    const slugParam = searchParams.get('slug')
    const cacheTtlSeconds = 60 * 60 * 24

    const getScoresByMpId = (mpId: number) =>
      unstable_cache(
        async () => {
          return db
            .select()
            .from(calculatedScores)
            .where(eq(calculatedScores.mpId, mpId))
            .orderBy(desc(calculatedScores.calculatedAt))
            .limit(1)
        },
        ['scores', 'mp', String(mpId)],
        { revalidate: cacheTtlSeconds, tags: ['scores', `scores:mp:${mpId}`] }
      )()

    const getMpIdBySlug = (slug: string) =>
      unstable_cache(
        async () => {
          return db
            .select({ id: mps.id })
            .from(mps)
            .where(eq(mps.slug, slug))
            .limit(1)
        },
        ['mp', 'slug', slug],
        { revalidate: cacheTtlSeconds, tags: ['mp', `mp:slug:${slug}`] }
      )()

    const getAllLatestScores = unstable_cache(
      async () => {
        const allScores = await db
          .select({
            mpId: calculatedScores.mpId,
            overallScore: calculatedScores.overallScore,
            legislativeActivityScore: calculatedScores.legislativeActivityScore,
            fiscalResponsibilityScore: calculatedScores.fiscalResponsibilityScore,
            constituentEngagementScore: calculatedScores.constituentEngagementScore,
            votingParticipationScore: calculatedScores.votingParticipationScore,
            calculatedAt: calculatedScores.calculatedAt,
          })
          .from(calculatedScores)
          .innerJoin(mps, eq(calculatedScores.mpId, mps.id))
          .where(eq(mps.isActive, true))

        // Group by MP and get most recent score for each
        const scoresMap = new Map<number, typeof allScores[0]>()
        for (const score of allScores) {
          const existing = scoresMap.get(score.mpId)
          if (!existing || score.calculatedAt > existing.calculatedAt) {
            scoresMap.set(score.mpId, score)
          }
        }

        return Array.from(scoresMap.values()).map((score) => ({
          mpId: score.mpId,
          overallScore: parseFloat(score.overallScore.toString()),
          legislativeActivityScore: parseFloat(
            score.legislativeActivityScore.toString()
          ),
          fiscalResponsibilityScore: parseFloat(
            score.fiscalResponsibilityScore.toString()
          ),
          constituentEngagementScore: parseFloat(
            score.constituentEngagementScore.toString()
          ),
          votingParticipationScore: parseFloat(
            score.votingParticipationScore.toString()
          ),
          calculatedAt: score.calculatedAt,
        }))
      },
      ['scores', 'all'],
      { revalidate: cacheTtlSeconds, tags: ['scores', 'scores:all'] }
    )

    // If mpId is provided, get scores for that MP
    if (mpIdParam) {
      const mpId = parseInt(mpIdParam, 10)
      if (isNaN(mpId)) {
        return NextResponse.json(
          { error: 'Invalid mpId parameter' },
          { status: 400 }
        )
      }

      const scores = await getScoresByMpId(mpId)

      if (scores.length === 0) {
        return NextResponse.json(
          { error: 'Scores not found for this MP' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        mpId,
        overallScore: parseFloat(scores[0].overallScore.toString()),
        legislativeActivityScore: parseFloat(scores[0].legislativeActivityScore.toString()),
        fiscalResponsibilityScore: parseFloat(scores[0].fiscalResponsibilityScore.toString()),
        constituentEngagementScore: parseFloat(scores[0].constituentEngagementScore.toString()),
        votingParticipationScore: parseFloat(scores[0].votingParticipationScore.toString()),
        calculatedAt: scores[0].calculatedAt,
      })
    }

    // If slug is provided, get scores for that MP
    if (slugParam) {
      const mp = await getMpIdBySlug(slugParam)

      if (mp.length === 0) {
        return NextResponse.json(
          { error: 'MP not found' },
          { status: 404 }
        )
      }

      const scores = await getScoresByMpId(mp[0].id)

      if (scores.length === 0) {
        return NextResponse.json(
          { error: 'Scores not found for this MP' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        mpId: mp[0].id,
        slug: slugParam,
        overallScore: parseFloat(scores[0].overallScore.toString()),
        legislativeActivityScore: parseFloat(scores[0].legislativeActivityScore.toString()),
        fiscalResponsibilityScore: parseFloat(scores[0].fiscalResponsibilityScore.toString()),
        constituentEngagementScore: parseFloat(scores[0].constituentEngagementScore.toString()),
        votingParticipationScore: parseFloat(scores[0].votingParticipationScore.toString()),
        calculatedAt: scores[0].calculatedAt,
      })
    }

    // If no parameters, return all scores (for admin/analytics purposes)
    // Limit to most recent scores per MP
    const scoresArray = await getAllLatestScores()

    return NextResponse.json({
      scores: scoresArray,
      count: scoresArray.length,
    })
  } catch (error) {
    console.error('Error fetching scores:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

