import { db } from '@/lib/db'
import {
  votes,
  bills,
  petitions,
  committeeParticipation,
  mps,
} from '@/lib/db/schema'
import { eq, desc, isNotNull } from 'drizzle-orm'
import { AnalyticsTab } from './AnalyticsTab'
import {
  calculatePartyAverages,
  calculateNationalAverages,
} from '../../../../lib/utils/comparisons.js'

interface AnalyticsTabWrapperProps {
  mpId: number
  slug: string
}

export async function AnalyticsTabWrapper({
  mpId,
  slug,
}: AnalyticsTabWrapperProps) {
  // Fetch MP data to get party information
  const mpData = await db
    .select({ caucusShortName: mps.caucusShortName })
    .from(mps)
    .where(eq(mps.id, mpId))
    .limit(1)
    .then((results) => results[0])

  // Fetch all data and calculate comparisons in parallel
  const [
    allVotes,
    allBills,
    allPetitions,
    allCommittees,
    partyAverages,
    nationalAverages,
  ] = await Promise.all([
    // Fetch all votes for this MP
    db
      .select()
      .from(votes)
      .where(eq(votes.mpId, mpId))
      .orderBy(desc(votes.date)),

    // Fetch bills sponsored by this MP
    db
      .select()
      .from(bills)
      .where(eq(bills.sponsorMpId, mpId))
      .orderBy(desc(bills.introductionDate)),

    // Fetch petitions sponsored by this MP
    db
      .select()
      .from(petitions)
      .where(eq(petitions.sponsorMpId, mpId))
      .orderBy(desc(petitions.presentedDate)),

    // Fetch committee participation for this MP
    db
      .select()
      .from(committeeParticipation)
      .where(eq(committeeParticipation.mpId, mpId))
      .orderBy(desc(committeeParticipation.startDate)),

    // Calculate party averages
    calculatePartyAverages(mpData?.caucusShortName || null),

    // Calculate national averages
    calculateNationalAverages(),
  ])

  // Map committees to ensure meetingCount is always a number
  const mappedCommittees = allCommittees.map((committee) => ({
    id: committee.id,
    committeeName: committee.committeeName,
    role: committee.role,
    meetingCount: committee.meetingCount ?? 0,
  }))

  return (
    <AnalyticsTab
      mpId={mpId}
      slug={slug}
      votes={allVotes}
      bills={allBills}
      petitions={allPetitions}
      committees={mappedCommittees}
      partyAverages={partyAverages}
      nationalAverages={nationalAverages}
    />
  )
}

