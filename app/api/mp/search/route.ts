import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mps } from '@/lib/db/schema'
import { ilike, or } from 'drizzle-orm'

/**
 * GET /api/mp/search
 * 
 * Query parameters:
 * - q: search query (MP name or riding name)
 * - limit: maximum number of results (default: 20)
 * 
 * Returns list of MPs matching the search query
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // Allow higher limit for fetching all MPs (e.g., for client-side fuzzy search)
    const maxLimit = limit > 100 ? 500 : 100

    if (limit < 1 || limit > maxLimit) {
      return NextResponse.json(
        { error: `Limit must be between 1 and ${maxLimit}` },
        { status: 400 }
      )
    }

    // If query is empty or missing, return all MPs (for client-side fuzzy search)
    if (!query || query.trim().length === 0) {
      const results = await db
        .select({
          id: mps.id,
          fullName: mps.fullName,
          slug: mps.slug,
          constituencyName: mps.constituencyName,
          province: mps.province,
          caucusShortName: mps.caucusShortName,
          photoUrl: mps.photoUrl,
        })
        .from(mps)
        .limit(limit)

      return NextResponse.json({ results })
    }

    const searchTerm = `%${query.trim()}%`

    // Search by MP name or constituency name
    const results = await db
      .select({
        id: mps.id,
        fullName: mps.fullName,
        slug: mps.slug,
        constituencyName: mps.constituencyName,
        province: mps.province,
        caucusShortName: mps.caucusShortName,
        photoUrl: mps.photoUrl,
      })
      .from(mps)
      .where(
        or(
          ilike(mps.fullName, searchTerm),
          ilike(mps.constituencyName, searchTerm)
        )
      )
      .limit(limit)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error in MP search API:', error)
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

