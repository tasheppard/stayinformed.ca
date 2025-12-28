'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { OverviewTab } from './OverviewTab'
import { VotingRecordTab } from './VotingRecordTab'
import { ExpensesTab } from './ExpensesTab'
import { AnalyticsTab } from './AnalyticsTab'

interface ComparisonStats {
  votingParticipationRate: number
  billsPerMP: number
  petitionsPerMP: number
  committeesPerMP: number
  committeeMeetingsPerMP: number
}

interface MPProfileTabsProps {
  mpId: number
  slug: string
  mpData: any
  scores: any
  votes: any[]
  bills: any[]
  expenses: any[]
  petitions: any[]
  committees: any[]
  recentVotes: any[]
  recentBills: any[]
  recentExpenses: any[]
  recentPetitions: any[]
  partyAverage?: number
  nationalAverage?: number
  partyAverages?: ComparisonStats | null
  nationalAverages?: ComparisonStats
}

export function MPProfileTabs({
  mpId,
  slug,
  mpData,
  scores,
  votes,
  bills,
  expenses,
  petitions,
  committees,
  recentVotes,
  recentBills,
  recentExpenses,
  recentPetitions,
  partyAverage,
  nationalAverage,
  partyAverages,
  nationalAverages,
}: MPProfileTabsProps) {
  return (
    <Tabs.Root defaultValue="overview" className="w-full">
      {/* Desktop Tab Navigation */}
      <Tabs.List
        className="hidden md:flex border-b border-gray-200 mb-6"
        aria-label="MP profile sections"
      >
        <Tabs.Trigger
          value="overview"
          className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          aria-label="Overview tab - View MP contact information, scores, and recent activity"
        >
          Overview
        </Tabs.Trigger>
        <Tabs.Trigger
          value="voting-record"
          className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          aria-label="Voting Record tab - View MP voting history and records"
        >
          Voting Record
        </Tabs.Trigger>
        <Tabs.Trigger
          value="expenses"
          className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          aria-label="Expenses tab - View MP expense reports and breakdowns"
        >
          Expenses
        </Tabs.Trigger>
        <Tabs.Trigger
          value="analytics"
          className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          aria-label="Analytics tab - View MP performance analytics and statistics"
        >
          Analytics
        </Tabs.Trigger>
      </Tabs.List>

      {/* Mobile Bottom Tab Navigation */}
      <Tabs.List
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 grid grid-cols-4 z-10"
        aria-label="MP profile sections"
      >
        <Tabs.Trigger
          value="overview"
          className="px-2 py-3 text-xs font-medium text-gray-600 data-[state=active]:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors"
          aria-label="Overview tab"
        >
          Overview
        </Tabs.Trigger>
        <Tabs.Trigger
          value="voting-record"
          className="px-2 py-3 text-xs font-medium text-gray-600 data-[state=active]:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors"
          aria-label="Voting Record tab"
        >
          Voting
        </Tabs.Trigger>
        <Tabs.Trigger
          value="expenses"
          className="px-2 py-3 text-xs font-medium text-gray-600 data-[state=active]:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors"
          aria-label="Expenses tab"
        >
          Expenses
        </Tabs.Trigger>
        <Tabs.Trigger
          value="analytics"
          className="px-2 py-3 text-xs font-medium text-gray-600 data-[state=active]:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors"
          aria-label="Analytics tab"
        >
          Analytics
        </Tabs.Trigger>
      </Tabs.List>

      {/* Tab Content */}
      <Tabs.Content
        value="overview"
        className="focus:outline-none mb-16 md:mb-0"
      >
        <OverviewTab
          mpId={mpId}
          slug={slug}
          mpData={mpData}
          scores={scores}
          recentVotes={recentVotes}
          recentBills={recentBills}
          recentExpenses={recentExpenses}
          recentPetitions={recentPetitions}
        />
      </Tabs.Content>

      <Tabs.Content
        value="voting-record"
        className="focus:outline-none mb-16 md:mb-0"
      >
        <VotingRecordTab mpId={mpId} slug={slug} votes={votes} />
      </Tabs.Content>

      <Tabs.Content
        value="expenses"
        className="focus:outline-none mb-16 md:mb-0"
      >
        <ExpensesTab
          mpId={mpId}
          slug={slug}
          expenses={expenses}
          partyAverage={partyAverage}
          nationalAverage={nationalAverage}
        />
      </Tabs.Content>

      <Tabs.Content
        value="analytics"
        className="focus:outline-none mb-16 md:mb-0"
      >
        <AnalyticsTab
          mpId={mpId}
          slug={slug}
          votes={votes}
          bills={bills}
          petitions={petitions}
          committees={committees}
          partyAverages={partyAverages}
          nationalAverages={nationalAverages}
        />
      </Tabs.Content>
    </Tabs.Root>
  )
}
