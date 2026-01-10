import { db } from '@/lib/db'
import { expenses, mps } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { ExpensesTab } from './ExpensesTab'
import { getUserWithPremium } from '@/lib/auth/get-user-with-premium'

interface ExpensesTabWrapperProps {
  mpId: number
  slug: string
}

export async function ExpensesTabWrapper({
  mpId,
  slug,
}: ExpensesTabWrapperProps) {
  // Check premium status
  const { isPremium } = await getUserWithPremium()

  // Fetch all expenses for this MP, ordered by fiscal year and quarter
  const allExpenses = await db
    .select()
    .from(expenses)
    .where(eq(expenses.mpId, mpId))
    .orderBy(desc(expenses.fiscalYear), desc(expenses.quarter))

  // TODO: Calculate party and national averages
  // For now, we'll pass undefined and these can be calculated later
  // when we have more data or implement aggregation queries
  const partyAverage = undefined
  const nationalAverage = undefined

  return (
    <ExpensesTab
      mpId={mpId}
      slug={slug}
      expenses={allExpenses}
      partyAverage={partyAverage}
      nationalAverage={nationalAverage}
      isPremium={isPremium}
    />
  )
}

