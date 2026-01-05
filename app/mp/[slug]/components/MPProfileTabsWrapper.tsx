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
import { eq, desc, and, gte, isNotNull } from 'drizzle-orm'
import { MPProfileTabs } from './MPProfileTabs'
import {
  calculatePartyAverages,
  calculateNationalAverages,
} from '../../../../lib/utils/comparisons'

interface MPProfileTabsWrapperProps {
  mpId: number
  slug: string
}

export async function MPProfileTabsWrapper({
  mpId,
  slug,
}: MPProfileTabsWrapperProps) {
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

    // All votes
    db
      .select()
      .from(votes)
      .where(eq(votes.mpId, mpId))
      .orderBy(desc(votes.date)),

    // Bills sponsored
    db
      .select()
      .from(bills)
      .where(eq(bills.sponsorMpId, mpId))
      .orderBy(desc(bills.introductionDate)),

    // Expenses
    db
      .select()
      .from(expenses)
      .where(eq(expenses.mpId, mpId))
      .orderBy(desc(expenses.fiscalYear), desc(expenses.quarter)),

    // Petitions
    db
      .select()
      .from(petitions)
      .where(eq(petitions.sponsorMpId, mpId))
      .orderBy(desc(petitions.presentedDate)),

    // Committees
    db
      .select()
      .from(committeeParticipation)
      .where(eq(committeeParticipation.mpId, mpId))
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
      committees={allCommittees}
      recentVotes={recentVotes}
      recentBills={recentBills}
      recentExpenses={recentExpenses}
      recentPetitions={recentPetitions}
      partyAverage={partyAverage}
      nationalAverage={nationalAverage}
      partyAverages={partyAverages}
      nationalAverages={nationalAverages}
    />
  )
}

