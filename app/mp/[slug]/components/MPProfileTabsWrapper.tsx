import { db } from '@/lib/db'
import {
  calculatedScores,
  votes,
  bills,
  expenses,
  petitions,
  committeeParticipation,
  mps,
} from '@/lib/db/schema'
import { eq, desc, and, gte, isNotNull, or, isNull, gt, like } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { MPProfileTabs } from './MPProfileTabs'
import {
  calculatePartyAverages,
  calculateNationalAverages,
} from '@/lib/utils/comparisons'
import { getUserWithPremium } from '@/lib/auth/get-user-with-premium'

interface MPProfileTabsWrapperProps {
  mpId: number
  slug: string
}

// Current parliament is 45th (sessions start with "45-")
// Free users only see current parliament (45th)
// Premium users see past 3 parliaments (43rd, 44th, 45th)
const CURRENT_PARLIAMENT_PREFIX = '45-'
const CURRENT_PARLIAMENT_START_DATE = new Date('2021-09-20') // 45th parliament started Sept 20, 2021

export async function MPProfileTabsWrapper({
  mpId,
  slug,
}: MPProfileTabsWrapperProps) {
  // Check premium status
  const { isPremium } = await getUserWithPremium()

  // Fetch all data in parallel for better performance
  const [
    mpData,
    scores,
    allVotes,
    allBills,
    allExpenses,
    allPetitions,
    allCommittees,
  ] = await Promise.all([
    // MP data
    db
      .select()
      .from(mps)
      .where(eq(mps.id, mpId))
      .limit(1)
      .then((results) => results[0]),

    // Latest scores
    db
      .select()
      .from(calculatedScores)
      .where(eq(calculatedScores.mpId, mpId))
      .orderBy(desc(calculatedScores.calculatedAt))
      .limit(1)
      .then((results) => results[0] || null),

    // All votes - filter by parliament for free users
    db
      .select()
      .from(votes)
      .where(
        isPremium
          ? eq(votes.mpId, mpId)
          : and(
              eq(votes.mpId, mpId),
              like(votes.session, `${CURRENT_PARLIAMENT_PREFIX}%`)
            )
      )
      .orderBy(desc(votes.date)),

    // Bills sponsored - filter by date for free users (current parliament started Sept 20, 2021)
    db
      .select()
      .from(bills)
      .where(
        isPremium
          ? eq(bills.sponsorMpId, mpId)
          : and(
              eq(bills.sponsorMpId, mpId),
              gte(bills.introductionDate, CURRENT_PARLIAMENT_START_DATE)
            )
      )
      .orderBy(desc(bills.introductionDate)),

    // Expenses - filter by fiscal year and quarter for free users
    // Parliament started Sept 20, 2021, so exclude Q1 and Q2 of fiscal year 2021 (pre-parliament)
    // Include: fiscalYear > 2021 OR (fiscalYear = 2021 AND quarter >= 3)
    db
      .select()
      .from(expenses)
      .where(
        isPremium
          ? eq(expenses.mpId, mpId)
          : and(
              eq(expenses.mpId, mpId),
              or(
                gt(expenses.fiscalYear, 2021), // All of fiscal year 2022 and later
                and(eq(expenses.fiscalYear, 2021), gte(expenses.quarter, 3)) // Q3 and Q4 of 2021 (Oct 2021 - Mar 2022)
              )
            )
      )
      .orderBy(desc(expenses.fiscalYear), desc(expenses.quarter)),

    // Petitions - filter by date for free users (current parliament started Sept 20, 2021)
    db
      .select()
      .from(petitions)
      .where(
        isPremium
          ? eq(petitions.sponsorMpId, mpId)
          : and(
              eq(petitions.sponsorMpId, mpId),
              gte(petitions.presentedDate, CURRENT_PARLIAMENT_START_DATE)
            )
      )
      .orderBy(desc(petitions.presentedDate)),

    // Committees - filter by date for free users (current parliament started Sept 20, 2021)
    // Include committees with null startDate (likely current/ongoing) or startDate >= parliament start
    db
      .select()
      .from(committeeParticipation)
      .where(
        isPremium
          ? eq(committeeParticipation.mpId, mpId)
          : and(
              eq(committeeParticipation.mpId, mpId),
              or(
                isNull(committeeParticipation.startDate), // Include null startDates (likely current)
                gte(committeeParticipation.startDate, CURRENT_PARLIAMENT_START_DATE)
              )
            )
      )
      .orderBy(desc(committeeParticipation.startDate)),
  ])

  // Calculate recent activity (last 7 days) for Overview tab
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  sevenDaysAgo.setHours(0, 0, 0, 0) // Reset to start of day

  const recentVotes = allVotes
    .filter((vote) => {
      const voteDate = new Date(vote.date)
      return voteDate >= sevenDaysAgo
    })
    .slice(0, 5)

  const recentBills = allBills
    .filter((bill) => {
      if (!bill.introductionDate) return false
      const billDate = new Date(bill.introductionDate)
      return billDate >= sevenDaysAgo
    })
    .slice(0, 5)

  const recentExpenses = allExpenses
    .filter((expense) => {
      const expenseDate = new Date(expense.createdAt)
      return expenseDate >= sevenDaysAgo
    })
    .slice(0, 5)

  const recentPetitions = allPetitions
    .filter((petition) => {
      if (!petition.presentedDate) return false
      const petitionDate = new Date(petition.presentedDate)
      return petitionDate >= sevenDaysAgo
    })
    .slice(0, 5)

  // Calculate party and national averages for expenses and analytics
  const [partyAverages, nationalAverages] = await Promise.all([
    calculatePartyAverages(mpData?.caucusShortName || null),
    calculateNationalAverages(),
  ])

  // Calculate expense averages (for Expenses tab)
  const partyAverage = undefined // TODO: Calculate expense averages
  const nationalAverage = undefined // TODO: Calculate expense averages

  // Map committees to ensure meetingCount is always a number
  const mappedCommittees = allCommittees.map((committee) => ({
    id: committee.id,
    committeeName: committee.committeeName,
    role: committee.role,
    meetingCount: committee.meetingCount ?? 0,
  }))

  return (
    <MPProfileTabs
      mpId={mpId}
      slug={slug}
      mpData={mpData}
      scores={scores}
      votes={allVotes}
      bills={allBills}
      expenses={allExpenses}
      petitions={allPetitions}
      committees={mappedCommittees}
      recentVotes={recentVotes}
      recentBills={recentBills}
      recentExpenses={recentExpenses}
      recentPetitions={recentPetitions}
      partyAverage={partyAverage}
      nationalAverage={nationalAverage}
      partyAverages={partyAverages}
      nationalAverages={nationalAverages}
      isPremium={isPremium}
    />
  )
}

