import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  mps,
  votes,
  expenses,
  bills,
  petitions,
  committeeParticipation,
} from '@/lib/db/schema'
import { eq, desc, and, gte, like, or, isNull, gt } from 'drizzle-orm'
import { getUserWithPremium } from '@/lib/auth/get-user-with-premium'
import { convertToCSV, generateFilename, formatDateLocal } from '@/lib/utils/csv-export'

const CURRENT_PARLIAMENT_PREFIX = '45-'
const CURRENT_PARLIAMENT_START_DATE = new Date('2021-09-20')

type ExportType = 'votes' | 'expenses' | 'bills' | 'petitions' | 'committees'

/**
 * GET /api/mp/[slug]/export?type=votes|expenses|bills|petitions|committees
 *
 * Exports MP data to CSV format (Premium only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const searchParams = request.nextUrl.searchParams
    const exportType = searchParams.get('type') as ExportType

    if (!slug) {
      return NextResponse.json(
        { error: 'MP slug is required' },
        { status: 400 }
      )
    }

    if (!exportType || !['votes', 'expenses', 'bills', 'petitions', 'committees'].includes(exportType)) {
      return NextResponse.json(
        { error: 'Valid export type is required (votes, expenses, bills, petitions, committees)' },
        { status: 400 }
      )
    }

    // Check premium status
    const { user, isPremium } = await getUserWithPremium()
    if (!user || !isPremium) {
      return NextResponse.json(
        { error: 'Premium subscription required for CSV export' },
        { status: 403 }
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

    let csvData: string
    let filename: string

    switch (exportType) {
      case 'votes':
        // Fetch all votes (premium users get all parliaments)
        const allVotes = await db
          .select()
          .from(votes)
          .where(eq(votes.mpId, mp.id))
          .orderBy(desc(votes.date))

        csvData = convertToCSV(
          allVotes.map((vote) => ({
            voteNumber: vote.voteNumber,
            date: formatDateLocal(vote.date),
            session: vote.session,
            billNumber: vote.billNumber || '',
            billTitle: vote.billTitle || '',
            voteResult: vote.voteResult,
          })),
          [
            { key: 'voteNumber', label: 'Vote Number' },
            { key: 'date', label: 'Date' },
            { key: 'session', label: 'Session' },
            { key: 'billNumber', label: 'Bill Number' },
            { key: 'billTitle', label: 'Bill Title' },
            { key: 'voteResult', label: 'Vote Result' },
          ]
        )
        filename = generateFilename(`${mp.slug}_votes`)
        break

      case 'expenses':
        // Fetch all expenses (premium users get all fiscal years)
        const allExpenses = await db
          .select()
          .from(expenses)
          .where(eq(expenses.mpId, mp.id))
          .orderBy(desc(expenses.fiscalYear), desc(expenses.quarter))

        csvData = convertToCSV(
          allExpenses.map((expense) => ({
            fiscalYear: expense.fiscalYear,
            quarter: expense.quarter,
            category: expense.category,
            amount: expense.amount,
            description: expense.description || '',
          })),
          [
            { key: 'fiscalYear', label: 'Fiscal Year' },
            { key: 'quarter', label: 'Quarter' },
            { key: 'category', label: 'Category' },
            { key: 'amount', label: 'Amount (CAD)' },
            { key: 'description', label: 'Description' },
          ]
        )
        filename = generateFilename(`${mp.slug}_expenses`)
        break

      case 'bills':
        // Fetch all bills (premium users get all parliaments)
        const allBills = await db
          .select()
          .from(bills)
          .where(eq(bills.sponsorMpId, mp.id))
          .orderBy(desc(bills.introductionDate))

        csvData = convertToCSV(
          allBills.map((bill) => ({
            billNumber: bill.billNumber,
            title: bill.title,
            introductionDate: formatDateLocal(bill.introductionDate),
            status: bill.status || '',
            summary: bill.summary || '',
          })),
          [
            { key: 'billNumber', label: 'Bill Number' },
            { key: 'title', label: 'Title' },
            { key: 'introductionDate', label: 'Introduction Date' },
            { key: 'status', label: 'Status' },
            { key: 'summary', label: 'Summary' },
          ]
        )
        filename = generateFilename(`${mp.slug}_bills`)
        break

      case 'petitions':
        // Fetch all petitions (premium users get all parliaments)
        const allPetitions = await db
          .select()
          .from(petitions)
          .where(eq(petitions.sponsorMpId, mp.id))
          .orderBy(desc(petitions.presentedDate))

        csvData = convertToCSV(
          allPetitions.map((petition) => ({
            petitionNumber: petition.petitionNumber,
            title: petition.title,
            presentedDate: formatDateLocal(petition.presentedDate),
            status: petition.status || '',
            signatureCount: petition.signatureCount ?? '',
          })),
          [
            { key: 'petitionNumber', label: 'Petition Number' },
            { key: 'title', label: 'Title' },
            { key: 'presentedDate', label: 'Presented Date' },
            { key: 'status', label: 'Status' },
            { key: 'signatureCount', label: 'Signature Count' },
          ]
        )
        filename = generateFilename(`${mp.slug}_petitions`)
        break

      case 'committees':
        // Fetch all committee participation (premium users get all parliaments)
        const allCommittees = await db
          .select()
          .from(committeeParticipation)
          .where(eq(committeeParticipation.mpId, mp.id))
          .orderBy(desc(committeeParticipation.startDate))

        csvData = convertToCSV(
          allCommittees.map((committee) => ({
            committeeName: committee.committeeName,
            role: committee.role || '',
            startDate: formatDateLocal(committee.startDate),
            endDate: formatDateLocal(committee.endDate),
            meetingCount: committee.meetingCount ?? 0,
          })),
          [
            { key: 'committeeName', label: 'Committee Name' },
            { key: 'role', label: 'Role' },
            { key: 'startDate', label: 'Start Date' },
            { key: 'endDate', label: 'End Date' },
            { key: 'meetingCount', label: 'Meeting Count' },
          ]
        )
        filename = generateFilename(`${mp.slug}_committees`)
        break
    }

    // Return CSV file
    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error in CSV export API:', error)
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

