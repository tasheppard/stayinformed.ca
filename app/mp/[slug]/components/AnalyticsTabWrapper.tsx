import { db } from '@/lib/db'
import { votes, bills, petitions, committeeParticipation } from '@/lib/db/schema'
import { eq, desc, isNotNull } from 'drizzle-orm'
import { AnalyticsTab } from './AnalyticsTab'

interface AnalyticsTabWrapperProps {
  mpId: number
  slug: string
}

export async function AnalyticsTabWrapper({
  mpId,
  slug,
}: AnalyticsTabWrapperProps) {
  // Fetch all votes for this MP
  const allVotes = await db
    .select()
    .from(votes)
    .where(eq(votes.mpId, mpId))
    .orderBy(desc(votes.date))

  // Fetch bills sponsored by this MP
  const allBills = await db
    .select()
    .from(bills)
    .where(eq(bills.sponsorMpId, mpId))
    .orderBy(desc(bills.introductionDate))

  // Fetch petitions sponsored by this MP
  const allPetitions = await db
    .select()
    .from(petitions)
    .where(eq(petitions.sponsorMpId, mpId))
    .orderBy(desc(petitions.presentedDate))

  // Fetch committee participation for this MP
  const allCommittees = await db
    .select()
    .from(committeeParticipation)
    .where(eq(committeeParticipation.mpId, mpId))
    .orderBy(desc(committeeParticipation.startDate))

  return (
    <AnalyticsTab
      mpId={mpId}
      slug={slug}
      votes={allVotes}
      bills={allBills}
      petitions={allPetitions}
      committees={allCommittees}
    />
  )
}

