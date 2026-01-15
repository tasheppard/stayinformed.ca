import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import {
  emailSubscriptions,
  mps,
  users,
} from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * GET /api/email-subscriptions
 * 
 * Returns all email subscriptions for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active email subscriptions for the user with MP details
    const subscriptions = await db
      .select({
        id: emailSubscriptions.id,
        mpId: emailSubscriptions.mpId,
        isActive: emailSubscriptions.isActive,
        mp: {
          id: mps.id,
          fullName: mps.fullName,
          slug: mps.slug,
          constituencyName: mps.constituencyName,
          province: mps.province,
          caucusShortName: mps.caucusShortName,
          photoUrl: mps.photoUrl,
        },
      })
      .from(emailSubscriptions)
      .innerJoin(mps, eq(emailSubscriptions.mpId, mps.id))
      .where(
        and(
          eq(emailSubscriptions.userId, user.id),
          eq(emailSubscriptions.isActive, true)
        )
      )

    return NextResponse.json({ subscriptions })
  } catch (error) {
    console.error('Error fetching email subscriptions:', error)
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

/**
 * POST /api/email-subscriptions
 * 
 * Body: { mpId: number }
 * 
 * Creates a new email subscription for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mpId } = body

    if (!mpId || typeof mpId !== 'number') {
      return NextResponse.json(
        { error: 'mpId is required and must be a number' },
        { status: 400 }
      )
    }

    // Verify MP exists
    const mp = await db
      .select()
      .from(mps)
      .where(eq(mps.id, mpId))
      .limit(1)

    if (mp.length === 0) {
      return NextResponse.json(
        { error: 'MP not found' },
        { status: 404 }
      )
    }

    // Check if subscription already exists
    const existing = await db
      .select()
      .from(emailSubscriptions)
      .where(
        and(
          eq(emailSubscriptions.userId, user.id),
          eq(emailSubscriptions.mpId, mpId)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      // If exists but inactive, reactivate it
      if (!existing[0].isActive) {
        await db
          .update(emailSubscriptions)
          .set({
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(emailSubscriptions.id, existing[0].id))

        return NextResponse.json({
          message: 'Email subscription reactivated',
          subscription: {
            id: existing[0].id,
            mpId,
            isActive: true,
          },
        })
      } else {
        return NextResponse.json({
          message: 'Email subscription already exists',
          subscription: {
            id: existing[0].id,
            mpId,
            isActive: true,
          },
        })
      }
    }

    // Create new subscription
    const [subscription] = await db
      .insert(emailSubscriptions)
      .values({
        userId: user.id,
        mpId,
        isActive: true,
      })
      .returning()

    return NextResponse.json({
      message: 'Email subscription created',
      subscription,
    })
  } catch (error) {
    console.error('Error creating email subscription:', error)
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

/**
 * DELETE /api/email-subscriptions
 * 
 * Query parameters: mpId (number)
 * 
 * Deactivates an email subscription for the authenticated user
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const mpIdParam = searchParams.get('mpId')

    if (!mpIdParam) {
      return NextResponse.json(
        { error: 'mpId query parameter is required' },
        { status: 400 }
      )
    }

    const mpId = parseInt(mpIdParam, 10)
    if (isNaN(mpId)) {
      return NextResponse.json(
        { error: 'mpId must be a valid number' },
        { status: 400 }
      )
    }

    // Find and deactivate subscription
    const existing = await db
      .select()
      .from(emailSubscriptions)
      .where(
        and(
          eq(emailSubscriptions.userId, user.id),
          eq(emailSubscriptions.mpId, mpId)
        )
      )
      .limit(1)

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Email subscription not found' },
        { status: 404 }
      )
    }

    // Deactivate subscription (soft delete)
    await db
      .update(emailSubscriptions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(emailSubscriptions.id, existing[0].id))

    return NextResponse.json({
      message: 'Email subscription deactivated',
    })
  } catch (error) {
    console.error('Error deleting email subscription:', error)
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
