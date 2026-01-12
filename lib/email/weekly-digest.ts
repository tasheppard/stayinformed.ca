import { db } from '../db'
import {
  users,
  mps,
  emailSubscriptions,
  votes,
  bills,
  expenses,
  petitions,
} from '../db/schema'
import { eq, and, gte, sql } from 'drizzle-orm'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://stayinformed.ca')

export interface MPActivity {
  votes: Array<{
    id: number
    voteNumber: number
    session: string
    date: Date
    billNumber: string | null
    billTitle: string | null
    voteResult: string
  }>
  bills: Array<{
    id: number
    billNumber: string
    title: string
    introductionDate: Date | null
    status: string | null
  }>
  expenses: Array<{
    id: number
    fiscalYear: number
    quarter: number
    category: string
    amount: string
    description: string | null
  }>
  petitions: Array<{
    id: number
    petitionNumber: string
    title: string
    presentedDate: Date | null
    signatureCount: number | null
  }>
}

export interface UserDigest {
  userId: string
  userEmail: string
  userName: string
  html: string
  text: string
}

/**
 * Get activities for an MP from the past 7 days
 */
async function getMPActivities(mpId: number, sevenDaysAgo: Date): Promise<MPActivity> {
  // Get votes from past 7 days
  const recentVotes = await db
    .select({
      id: votes.id,
      voteNumber: votes.voteNumber,
      session: votes.session,
      date: votes.date,
      billNumber: votes.billNumber,
      billTitle: votes.billTitle,
      voteResult: votes.voteResult,
    })
    .from(votes)
    .where(
      and(
        eq(votes.mpId, mpId),
        gte(votes.date, sevenDaysAgo)
      )
    )
    .orderBy(votes.date)

  // Get bills sponsored in past 7 days
  const recentBills = await db
    .select({
      id: bills.id,
      billNumber: bills.billNumber,
      title: bills.title,
      introductionDate: bills.introductionDate,
      status: bills.status,
    })
    .from(bills)
    .where(
      and(
        eq(bills.sponsorMpId, mpId),
        sql`${bills.introductionDate} IS NOT NULL`,
        gte(bills.introductionDate, sevenDaysAgo)
      )
    )
    .orderBy(bills.introductionDate)

  // Get expenses from past 7 days (based on created_at, as expenses are reported quarterly)
  // Note: We check expenses that were created/updated in the past 7 days
  const recentExpenses = await db
    .select({
      id: expenses.id,
      fiscalYear: expenses.fiscalYear,
      quarter: expenses.quarter,
      category: expenses.category,
      amount: expenses.amount,
      description: expenses.description,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.mpId, mpId),
        gte(expenses.createdAt, sevenDaysAgo)
      )
    )
    .orderBy(expenses.createdAt)

  // Get petitions sponsored in past 7 days
  const recentPetitions = await db
    .select({
      id: petitions.id,
      petitionNumber: petitions.petitionNumber,
      title: petitions.title,
      presentedDate: petitions.presentedDate,
      signatureCount: petitions.signatureCount,
    })
    .from(petitions)
    .where(
      and(
        eq(petitions.sponsorMpId, mpId),
        sql`${petitions.presentedDate} IS NOT NULL`,
        gte(petitions.presentedDate, sevenDaysAgo)
      )
    )
    .orderBy(petitions.presentedDate)

  return {
    votes: recentVotes.map(v => ({
      ...v,
      date: v.date instanceof Date ? v.date : new Date(v.date),
    })),
    bills: recentBills.map(b => ({
      ...b,
      introductionDate: b.introductionDate instanceof Date ? b.introductionDate : b.introductionDate ? new Date(b.introductionDate) : null,
    })),
    expenses: recentExpenses.map(e => ({
      ...e,
      amount: e.amount?.toString() || '0',
    })),
    petitions: recentPetitions.map(p => ({
      ...p,
      presentedDate: p.presentedDate instanceof Date ? p.presentedDate : p.presentedDate ? new Date(p.presentedDate) : null,
    })),
  }
}

/**
 * Format date for email display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format MP section for HTML email
 */
function formatMPSectionHTML(mp: { id: number; fullName: string; slug: string; constituencyName: string; province: string }, activities: MPActivity): string {
  const mpUrl = `${BASE_URL}/mp/${mp.slug}`
  const totalActivities = activities.votes.length + activities.bills.length + activities.expenses.length + activities.petitions.length

  if (totalActivities === 0) {
    return `
    <div class="mp-section">
      <div class="mp-header">
        <div>
          <h3 class="mp-name">${escapeHtml(mp.fullName)}</h3>
          <div class="mp-riding">${escapeHtml(mp.constituencyName)}, ${escapeHtml(mp.province)}</div>
        </div>
      </div>
      <div class="no-activity">No new activity in the past 7 days.</div>
      <a href="${mpUrl}" class="mp-link">View MP Profile →</a>
    </div>
    `
  }

  let sections = `
    <div class="mp-section">
      <div class="mp-header">
        <div>
          <h3 class="mp-name">${escapeHtml(mp.fullName)}</h3>
          <div class="mp-riding">${escapeHtml(mp.constituencyName)}, ${escapeHtml(mp.province)}</div>
        </div>
      </div>
  `

  // Votes section
  if (activities.votes.length > 0) {
    sections += `
      <div class="activity-section">
        <div class="activity-title">
          Votes
          <span class="activity-count">${activities.votes.length}</span>
        </div>
        <ul class="activity-list">
    `
    for (const vote of activities.votes) {
      const voteTitle = vote.billTitle || `Vote ${vote.voteNumber}`
      sections += `
          <li class="activity-item">
            <div class="activity-item-title">${escapeHtml(voteTitle)}</div>
            <div class="activity-item-date">${formatDate(vote.date)} · ${vote.voteResult}</div>
            <a href="${mpUrl}#votes" class="activity-item-link">View details →</a>
          </li>
      `
    }
    sections += `
        </ul>
      </div>
    `
  }

  // Bills section
  if (activities.bills.length > 0) {
    sections += `
      <div class="activity-section">
        <div class="activity-title">
          Bills Sponsored
          <span class="activity-count">${activities.bills.length}</span>
        </div>
        <ul class="activity-list">
    `
    for (const bill of activities.bills) {
      sections += `
          <li class="activity-item">
            <div class="activity-item-title">${escapeHtml(bill.title)}</div>
            <div class="activity-item-date">${bill.introductionDate ? formatDate(bill.introductionDate) : 'Date TBD'} · ${bill.billNumber}</div>
            <a href="${mpUrl}#bills" class="activity-item-link">View details →</a>
          </li>
      `
    }
    sections += `
        </ul>
      </div>
    `
  }

  // Expenses section
  if (activities.expenses.length > 0) {
    sections += `
      <div class="activity-section">
        <div class="activity-title">
          Expenses Reported
          <span class="activity-count">${activities.expenses.length}</span>
        </div>
        <ul class="activity-list">
    `
    for (const expense of activities.expenses) {
      const amount = parseFloat(expense.amount || '0')
      const formattedAmount = new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
      }).format(amount)
      sections += `
          <li class="activity-item">
            <div class="activity-item-title">${escapeHtml(expense.category)}</div>
            <div class="activity-item-date">${formattedAmount} · Q${expense.quarter} ${expense.fiscalYear}</div>
            <a href="${mpUrl}#expenses" class="activity-item-link">View details →</a>
          </li>
      `
    }
    sections += `
        </ul>
      </div>
    `
  }

  // Petitions section
  if (activities.petitions.length > 0) {
    sections += `
      <div class="activity-section">
        <div class="activity-title">
          Petitions Sponsored
          <span class="activity-count">${activities.petitions.length}</span>
        </div>
        <ul class="activity-list">
    `
    for (const petition of activities.petitions) {
      const signatureText = petition.signatureCount ? `${petition.signatureCount.toLocaleString()} signatures` : 'Signature count pending'
      sections += `
          <li class="activity-item">
            <div class="activity-item-title">${escapeHtml(petition.title)}</div>
            <div class="activity-item-date">${petition.presentedDate ? formatDate(petition.presentedDate) : 'Date TBD'} · ${signatureText}</div>
            <a href="${mpUrl}#petitions" class="activity-item-link">View details →</a>
          </li>
      `
    }
    sections += `
        </ul>
      </div>
    `
  }

  sections += `
      <a href="${mpUrl}" class="mp-link">View Full MP Profile →</a>
    </div>
  `

  return sections
}

/**
 * Format MP section for plain text email
 */
function formatMPSectionText(mp: { id: number; fullName: string; slug: string; constituencyName: string; province: string }, activities: MPActivity): string {
  const mpUrl = `${BASE_URL}/mp/${mp.slug}`
  const totalActivities = activities.votes.length + activities.bills.length + activities.expenses.length + activities.petitions.length

  let section = `${mp.fullName} (${mp.constituencyName}, ${mp.province})\n`
  section += `${mpUrl}\n\n`

  if (totalActivities === 0) {
    section += `No new activity in the past 7 days.\n\n`
    return section
  }

  // Votes
  if (activities.votes.length > 0) {
    section += `Votes (${activities.votes.length}):\n`
    for (const vote of activities.votes) {
      const voteTitle = vote.billTitle || `Vote ${vote.voteNumber}`
      section += `  • ${voteTitle} - ${formatDate(vote.date)} · ${vote.voteResult}\n`
    }
    section += `\n`
  }

  // Bills
  if (activities.bills.length > 0) {
    section += `Bills Sponsored (${activities.bills.length}):\n`
    for (const bill of activities.bills) {
      section += `  • ${bill.title} - ${bill.introductionDate ? formatDate(bill.introductionDate) : 'Date TBD'} · ${bill.billNumber}\n`
    }
    section += `\n`
  }

  // Expenses
  if (activities.expenses.length > 0) {
    section += `Expenses Reported (${activities.expenses.length}):\n`
    for (const expense of activities.expenses) {
      const amount = parseFloat(expense.amount || '0')
      const formattedAmount = new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
      }).format(amount)
      section += `  • ${expense.category} - ${formattedAmount} · Q${expense.quarter} ${expense.fiscalYear}\n`
    }
    section += `\n`
  }

  // Petitions
  if (activities.petitions.length > 0) {
    section += `Petitions Sponsored (${activities.petitions.length}):\n`
    for (const petition of activities.petitions) {
      const signatureText = petition.signatureCount ? `${petition.signatureCount.toLocaleString()} signatures` : 'Signature count pending'
      section += `  • ${petition.title} - ${petition.presentedDate ? formatDate(petition.presentedDate) : 'Date TBD'} · ${signatureText}\n`
    }
    section += `\n`
  }

  return section
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string | null | undefined): string {
  if (!text) return ''
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

/**
 * Generate weekly digest for a single user
 */
export async function generateWeeklyDigest(userId: string): Promise<UserDigest | null> {
  // Get user info
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (userRecords.length === 0) {
    return null
  }

  const user = userRecords[0]
  const userName = user.fullName || user.email.split('@')[0] || 'User'
  const unsubscribeUrl = `${BASE_URL}/account?tab=email&unsubscribe=true`

  // Get user's followed MPs (active subscriptions)
  const subscriptions = await db
    .select({
      mpId: emailSubscriptions.mpId,
      mp: {
        id: mps.id,
        fullName: mps.fullName,
        slug: mps.slug,
        constituencyName: mps.constituencyName,
        province: mps.province,
      },
    })
    .from(emailSubscriptions)
    .innerJoin(mps, eq(emailSubscriptions.mpId, mps.id))
    .where(
      and(
        eq(emailSubscriptions.userId, userId),
        eq(emailSubscriptions.isActive, true)
      )
    )

  if (subscriptions.length === 0) {
    // User has no active subscriptions, skip digest
    return null
  }

  // Calculate date range (past 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  // Get activities for each MP
  const mpActivities = await Promise.all(
    subscriptions.map(async (sub) => {
      const activities = await getMPActivities(sub.mpId, sevenDaysAgo)
      return {
        mp: sub.mp,
        activities,
      }
    })
  )

  // Load email templates using import.meta.url for reliable path resolution
  // This works in serverless/worker environments where process.cwd() may differ
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  const templatesDir = join(__dirname, 'templates')
  const htmlTemplate = await readFile(join(templatesDir, 'weekly-digest.html'), 'utf-8')
  const textTemplate = await readFile(join(templatesDir, 'weekly-digest.txt'), 'utf-8')

  // Generate MP sections
  const mpSectionsHTML = mpActivities.map((item) =>
    formatMPSectionHTML(item.mp, item.activities)
  ).join('\n')

  const mpSectionsText = mpActivities.map((item) =>
    formatMPSectionText(item.mp, item.activities)
  ).join('\n\n')

  // Replace placeholders in templates using function-based replacement
  // Function-based replacement treats return values as literal strings,
  // avoiding issues with special characters ($, &, etc.) in replacement strings
  const html = htmlTemplate
    .replace(/{{userName}}/g, () => escapeHtml(userName))
    .replace(/{{baseUrl}}/g, () => BASE_URL)
    .replace(/{{unsubscribeUrl}}/g, () => unsubscribeUrl)
    .replace(/{{MP_SECTIONS}}/g, () => mpSectionsHTML)

  const text = textTemplate
    .replace(/{{userName}}/g, () => userName)
    .replace(/{{baseUrl}}/g, () => BASE_URL)
    .replace(/{{unsubscribeUrl}}/g, () => unsubscribeUrl)
    .replace(/{{MP_SECTIONS}}/g, () => mpSectionsText)

  return {
    userId: user.id,
    userEmail: user.email,
    userName,
    html,
    text,
  }
}

/**
 * Generate weekly digests for all users with active email subscriptions
 * This function can be called by a Graphile Worker job
 */
export async function generateAllWeeklyDigests(): Promise<UserDigest[]> {
  // Get all users with active email subscriptions
  const subscriptions = await db
    .select({
      userId: emailSubscriptions.userId,
    })
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.isActive, true))

  // Get unique user IDs
  const uniqueUserIds = [...new Set(subscriptions.map((s) => s.userId))]

  const digests: UserDigest[] = []

  // Generate digest for each user
  for (const userId of uniqueUserIds) {
    try {
      const digest = await generateWeeklyDigest(userId)
      if (digest) {
        digests.push(digest)
      }
    } catch (error) {
      console.error(`Error generating digest for user ${userId}:`, error)
      // Continue with other users even if one fails
    }
  }

  return digests
}

