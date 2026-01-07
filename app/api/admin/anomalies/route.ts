import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { scraperAnomalies } from '@/lib/db/schema'
import { eq, desc, and, sql } from 'drizzle-orm'

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
 * GET /api/admin/anomalies
 * Fetch flagged anomalies from scrapers
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email || !(await isAdmin(user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const severity = searchParams.get('severity')
    const scraper = searchParams.get('scraper')
    
    // Validate and parse limit parameter
    const limitParam = searchParams.get('limit')
    let limit = 50 // Default limit
    if (limitParam) {
      const parsed = parseInt(limitParam, 10)
      // Validate: must be a valid number, greater than 0, and within reasonable bounds
      if (!isNaN(parsed) && parsed > 0 && parsed <= 1000) {
        limit = parsed
      }
      // If invalid, silently use default (50)
    }

    // Build query conditions
    const conditions = []
    if (status) {
      conditions.push(eq(scraperAnomalies.status, status))
    }
    if (severity) {
      conditions.push(eq(scraperAnomalies.severity, severity))
    }
    if (scraper) {
      conditions.push(eq(scraperAnomalies.scraperName, scraper))
    }

    const query = db
      .select()
      .from(scraperAnomalies)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(scraperAnomalies.createdAt))
      .limit(limit)

    const anomalies = await query

    // Get statistics - apply the same filters as the anomalies query
    // Build WHERE clause using the same conditions
    let statsQuery: ReturnType<typeof sql>
    
    if (conditions.length > 0) {
      // Build WHERE clause parts
      const whereParts: string[] = []
      const params: any[] = []
      
      if (status) {
        whereParts.push(`status = $${params.length + 1}`)
        params.push(status)
      }
      if (severity) {
        whereParts.push(`severity = $${params.length + 1}`)
        params.push(severity)
      }
      if (scraper) {
        whereParts.push(`scraper_name = $${params.length + 1}`)
        params.push(scraper)
      }
      
      // Use sql.unsafe to properly parameterize the query
      statsQuery = sql.unsafe(
        `SELECT 
          status,
          severity,
          COUNT(*) as count
        FROM scraper_anomalies
        WHERE ${whereParts.join(' AND ')}
        GROUP BY status, severity`,
        params
      )
    } else {
      statsQuery = sql`
        SELECT 
          status,
          severity,
          COUNT(*) as count
        FROM scraper_anomalies
        GROUP BY status, severity
      `
    }
    
    const stats = await db.execute(statsQuery)

    return NextResponse.json({
      anomalies,
      statistics: stats,
    })
  } catch (error) {
    console.error('Error fetching anomalies:', error)
    return NextResponse.json(
      { error: 'Failed to fetch anomalies' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/anomalies
 * Update anomaly status (review, resolve, dismiss)
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
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: id, status' },
        { status: 400 }
      )
    }

    // Validate id is a valid integer
    const parsedId = typeof id === 'string' ? parseInt(id, 10) : id
    if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json(
        { error: 'Invalid id. Must be a positive integer' },
        { status: 400 }
      )
    }

    // Validate status is one of the allowed values
    const allowedStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'] as const
    if (!allowedStatuses.includes(status as typeof allowedStatuses[number])) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const updateData: any = {
      status,
    }

    // Only set reviewedBy and reviewedAt when status is 'reviewed'
    if (status === 'reviewed') {
      updateData.reviewedBy = user.email
      updateData.reviewedAt = new Date()
    }

    // Only set resolvedAt when status is 'resolved'
    if (status === 'resolved') {
      updateData.resolvedAt = new Date()
    }

    const [updated] = await db
      .update(scraperAnomalies)
      .set(updateData)
      .where(eq(scraperAnomalies.id, parsedId))
      .returning()

    if (!updated) {
      return NextResponse.json(
        { error: 'Anomaly not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ anomaly: updated })
  } catch (error) {
    console.error('Error updating anomaly:', error)
    return NextResponse.json(
      { error: 'Failed to update anomaly' },
      { status: 500 }
    )
  }
}

