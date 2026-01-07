import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

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
 * GET /api/admin/job-status
 * Fetch Graphile Worker job status for all scraper jobs
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

    // Query Graphile Worker's job table directly
    // Graphile Worker stores jobs in graphile_worker.jobs table
    const jobs = await db.execute(sql`
      SELECT 
        id,
        job_queue_id,
        task_identifier,
        payload,
        priority,
        run_at,
        attempts,
        max_attempts,
        last_error,
        created_at,
        updated_at,
        key,
        locked_at,
        locked_by,
        revision
      FROM graphile_worker.jobs
      WHERE task_identifier LIKE 'scrape%'
      ORDER BY created_at DESC
      LIMIT 100
    `)

    // Get job statistics grouped by task
    const stats = await db.execute(sql`
      SELECT 
        task_identifier,
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE locked_at IS NULL AND run_at <= NOW()) as pending_jobs,
        COUNT(*) FILTER (WHERE locked_at IS NOT NULL) as running_jobs,
        COUNT(*) FILTER (WHERE attempts >= max_attempts) as failed_jobs,
        MAX(created_at) as last_run
      FROM graphile_worker.jobs
      WHERE task_identifier LIKE 'scrape%'
      GROUP BY task_identifier
      ORDER BY task_identifier
    `)

    return NextResponse.json({
      jobs: jobs,
      statistics: stats,
    })
  } catch (error) {
    console.error('Error fetching job status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    )
  }
}

