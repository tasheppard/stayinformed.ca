import { db } from '@/lib/db'
import { votes } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { VotingRecordTab } from './VotingRecordTab'

interface VotingRecordTabWrapperProps {
  mpId: number
  slug: string
}

export async function VotingRecordTabWrapper({
  mpId,
  slug,
}: VotingRecordTabWrapperProps) {
  // Fetch all votes for this MP, ordered by date (most recent first)
  const allVotes = await db
    .select()
    .from(votes)
    .where(eq(votes.mpId, mpId))
    .orderBy(desc(votes.date))

  return <VotingRecordTab mpId={mpId} slug={slug} votes={allVotes} />
}

