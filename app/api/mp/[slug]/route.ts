import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mps, calculatedScores } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

/**
 * GET /api/mp/[slug]
 *
 * Returns MP information including latest scores for the given slug
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    if (!slug) {
      return NextResponse.json(
        { error: 'MP slug is required' },
        { status: 400 }
      )
    }

    // Fetch MP by slug
    const mpResults = await db
      .select()
      .from(mps)
      .where(eq(mps.slug, slug))
      .limit(1)

    if (mpResults.length === 0) {
      return NextResponse.json(
        { error: 'MP not found' },
        { status: 404 }
      )
    }

    const mp = mpResults[0]

    // Fetch latest calculated scores
    const scores = await db
      .select()
      .from(calculatedScores)
      .where(eq(calculatedScores.mpId, mp.id))
      .orderBy(desc(calculatedScores.calculatedAt))
      .limit(1)

    return NextResponse.json({
      mp: {
        id: mp.id,
        fullName: mp.fullName,
        slug: mp.slug,
        constituencyName: mp.constituencyName,
        province: mp.province,
        caucusShortName: mp.caucusShortName,
        email: mp.email,
        phone: mp.phone,
        photoUrl: mp.photoUrl,
        createdAt: mp.createdAt,
        updatedAt: mp.updatedAt,
      },
      scores: scores.length > 0
        ? {
            overallScore: Number(scores[0].overallScore),
            legislativeActivityScore: Number(scores[0].legislativeActivityScore),
            fiscalResponsibilityScore: Number(scores[0].fiscalResponsibilityScore),
            constituentEngagementScore: Number(scores[0].constituentEngagementScore),
            votingParticipationScore: Number(scores[0].votingParticipationScore),
            calculatedAt: scores[0].calculatedAt,
          }
        : null,
    })
  } catch (error) {
    console.error('Error in MP API:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
