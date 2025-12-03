'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { OverviewTab } from './OverviewTab'
import { VotingRecordTab } from './VotingRecordTab'
import { ExpensesTab } from './ExpensesTab'
import { AnalyticsTab } from './AnalyticsTab'

interface MPProfileTabsProps {
  mpId: number
  slug: string
}

export function MPProfileTabs({ mpId, slug }: MPProfileTabsProps) {
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
        >
          Overview
        </Tabs.Trigger>
        <Tabs.Trigger
          value="voting-record"
          className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Voting Record
        </Tabs.Trigger>
        <Tabs.Trigger
          value="expenses"
          className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Expenses
        </Tabs.Trigger>
        <Tabs.Trigger
          value="analytics"
          className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
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
        >
          Overview
        </Tabs.Trigger>
        <Tabs.Trigger
          value="voting-record"
          className="px-2 py-3 text-xs font-medium text-gray-600 data-[state=active]:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors"
        >
          Voting
        </Tabs.Trigger>
        <Tabs.Trigger
          value="expenses"
          className="px-2 py-3 text-xs font-medium text-gray-600 data-[state=active]:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors"
        >
          Expenses
        </Tabs.Trigger>
        <Tabs.Trigger
          value="analytics"
          className="px-2 py-3 text-xs font-medium text-gray-600 data-[state=active]:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors"
        >
          Analytics
        </Tabs.Trigger>
      </Tabs.List>

      {/* Tab Content */}
      <Tabs.Content
        value="overview"
        className="focus:outline-none mb-16 md:mb-0"
      >
        <OverviewTab mpId={mpId} slug={slug} />
      </Tabs.Content>

      <Tabs.Content
        value="voting-record"
        className="focus:outline-none mb-16 md:mb-0"
      >
        <VotingRecordTab mpId={mpId} slug={slug} />
      </Tabs.Content>

      <Tabs.Content
        value="expenses"
        className="focus:outline-none mb-16 md:mb-0"
      >
        <ExpensesTab mpId={mpId} slug={slug} />
      </Tabs.Content>

      <Tabs.Content
        value="analytics"
        className="focus:outline-none mb-16 md:mb-0"
      >
        <AnalyticsTab mpId={mpId} slug={slug} />
      </Tabs.Content>
    </Tabs.Root>
  )
}
