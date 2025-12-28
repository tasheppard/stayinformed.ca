'use client'

import { useMemo } from 'react'
import { LineChart, BarChart } from '@tremor/react'

interface Vote {
  id: number
  date: Date | string
  voteResult: string
}

interface Bill {
  id: number
  billNumber: string
  title: string
  introductionDate: Date | string | null
  status: string | null
}

interface Petition {
  id: number
  petitionNumber: string
  title: string
  presentedDate: Date | string | null
  signatureCount: number | null
}

interface Committee {
  id: number
  committeeName: string
  role: string | null
  meetingCount: number
}

interface ComparisonStats {
  votingParticipationRate: number
  billsPerMP: number
  petitionsPerMP: number
  committeesPerMP: number
  committeeMeetingsPerMP: number
}

interface AnalyticsTabProps {
  mpId: number
  slug: string
  votes: Vote[]
  bills: Bill[]
  petitions: Petition[]
  committees: Committee[]
  partyAverages?: ComparisonStats | null
  nationalAverages?: ComparisonStats
}

export function AnalyticsTab({
  mpId,
  slug,
  votes,
  bills,
  petitions,
  committees,
  partyAverages,
  nationalAverages,
}: AnalyticsTabProps) {
  // Calculate voting participation rate over time (monthly)
  const votingParticipationData = useMemo(() => {
    // Group votes by month
    const monthlyData: Record<string, { total: number; participated: number }> = {}

    votes.forEach((vote) => {
      const date = new Date(vote.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { total: 0, participated: 0 }
      }
      
      monthlyData[monthKey].total++
      // Count as participated if not absent/abstained
      if (vote.voteResult !== 'Abstained' && vote.voteResult !== 'Paired') {
        monthlyData[monthKey].participated++
      }
    })

    // Convert to array and calculate participation rate
    return Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        'Participation Rate': data.total > 0 
          ? Math.round((data.participated / data.total) * 100) 
          : 0,
        'Total Votes': data.total,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12) // Last 12 months
  }, [votes])

  // Calculate overall statistics
  const stats = useMemo(() => {
    const totalVotes = votes.length
    const participatedVotes = votes.filter(
      (v) => v.voteResult !== 'Abstained' && v.voteResult !== 'Paired'
    ).length
    const participationRate = totalVotes > 0 
      ? Math.round((participatedVotes / totalVotes) * 100) 
      : 0

    return {
      totalVotes,
      participatedVotes,
      participationRate,
      billsSponsored: bills.length,
      petitionsSponsored: petitions.length,
      committeesCount: committees.length,
      totalCommitteeMeetings: committees.reduce((sum, c) => sum + c.meetingCount, 0),
    }
  }, [votes, bills, petitions, committees])

  // Format month for display
  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            Voting Participation
          </h3>
          <p className="text-2xl font-bold text-gray-900">
            {stats.participationRate}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.participatedVotes} of {stats.totalVotes} votes
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            Bills Sponsored
          </h3>
          <p className="text-2xl font-bold text-gray-900">
            {stats.billsSponsored}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            Petitions Sponsored
          </h3>
          <p className="text-2xl font-bold text-gray-900">
            {stats.petitionsSponsored}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            Committees
          </h3>
          <p className="text-2xl font-bold text-gray-900">
            {stats.committeesCount}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.totalCommitteeMeetings} meetings
          </p>
        </div>
      </div>

      {/* Voting Participation Chart */}
      {votingParticipationData.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">
            Voting Participation Rate (Last 12 Months)
          </h2>
          <LineChart
            data={votingParticipationData.map((d) => ({
              ...d,
              month: formatMonth(d.month),
            }))}
            index="month"
            categories={['Participation Rate']}
            colors={['blue']}
            valueFormatter={(value) => `${value}%`}
            yAxisWidth={60}
            className="h-64"
          />
        </div>
      )}

      {/* Comparison Visualizations */}
      {(partyAverages || nationalAverages) && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">
            Performance Comparison
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Compare this MP's performance to party and national averages
          </p>

          {/* Voting Participation Comparison */}
          {nationalAverages && (
            <div className="mb-8">
              <h3 className="text-lg font-medium mb-4">
                Voting Participation Rate
              </h3>
              <BarChart
                data={[
                  {
                    Metric: 'This MP',
                    'Participation Rate': stats.participationRate,
                  },
                  ...(partyAverages
                    ? [
                        {
                          Metric: 'Party Average',
                          'Participation Rate':
                            partyAverages.votingParticipationRate,
                        },
                      ]
                    : []),
                  {
                    Metric: 'National Average',
                    'Participation Rate':
                      nationalAverages.votingParticipationRate,
                  },
                ]}
                index="Metric"
                categories={['Participation Rate']}
                colors={['blue']}
                valueFormatter={(value) => `${value}%`}
                yAxisWidth={60}
                className="h-64"
              />
            </div>
          )}

          {/* Bills Sponsored Comparison */}
          {nationalAverages && (
            <div className="mb-8">
              <h3 className="text-lg font-medium mb-4">Bills Sponsored</h3>
              <BarChart
                data={[
                  {
                    Metric: 'This MP',
                    'Bills Sponsored': stats.billsSponsored,
                  },
                  ...(partyAverages
                    ? [
                        {
                          Metric: 'Party Average',
                          'Bills Sponsored': partyAverages.billsPerMP,
                        },
                      ]
                    : []),
                  {
                    Metric: 'National Average',
                    'Bills Sponsored': nationalAverages.billsPerMP,
                  },
                ]}
                index="Metric"
                categories={['Bills Sponsored']}
                colors={['green']}
                valueFormatter={(value) => `${value}`}
                yAxisWidth={60}
                className="h-64"
              />
            </div>
          )}

          {/* Petitions Sponsored Comparison */}
          {nationalAverages && (
            <div className="mb-8">
              <h3 className="text-lg font-medium mb-4">
                Petitions Sponsored
              </h3>
              <BarChart
                data={[
                  {
                    Metric: 'This MP',
                    'Petitions Sponsored': stats.petitionsSponsored,
                  },
                  ...(partyAverages
                    ? [
                        {
                          Metric: 'Party Average',
                          'Petitions Sponsored': partyAverages.petitionsPerMP,
                        },
                      ]
                    : []),
                  {
                    Metric: 'National Average',
                    'Petitions Sponsored': nationalAverages.petitionsPerMP,
                  },
                ]}
                index="Metric"
                categories={['Petitions Sponsored']}
                colors={['purple']}
                valueFormatter={(value) => `${value}`}
                yAxisWidth={60}
                className="h-64"
              />
            </div>
          )}

          {/* Committee Participation Comparison */}
          {nationalAverages && (
            <div>
              <h3 className="text-lg font-medium mb-4">
                Committee Participation
              </h3>
              <BarChart
                data={[
                  {
                    Metric: 'This MP',
                    'Committees': stats.committeesCount,
                  },
                  ...(partyAverages
                    ? [
                        {
                          Metric: 'Party Average',
                          'Committees': partyAverages.committeesPerMP,
                        },
                      ]
                    : []),
                  {
                    Metric: 'National Average',
                    'Committees': nationalAverages.committeesPerMP,
                  },
                ]}
                index="Metric"
                categories={['Committees']}
                colors={['orange']}
                valueFormatter={(value) => `${value}`}
                yAxisWidth={60}
                className="h-64"
              />
            </div>
          )}
        </div>
      )}

      {/* Bills Sponsored */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">
          Bills Sponsored ({bills.length})
        </h2>
        {bills.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No bills sponsored yet.
          </p>
        ) : (
          <div className="space-y-3">
            {bills.slice(0, 10).map((bill) => {
              const parlCaUrl = `https://www.parl.ca/LegisInfo/BillDetails.aspx?billId=${encodeURIComponent(bill.billNumber)}`
              return (
                <div
                  key={bill.id}
                  className="border-l-4 border-blue-500 pl-4 py-3"
                >
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    {bill.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{bill.billNumber}</span>
                    {bill.status && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span>{bill.status}</span>
                      </>
                    )}
                    {bill.introductionDate && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span>
                          {new Date(bill.introductionDate).toLocaleDateString(
                            'en-CA',
                            {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <a
                    href={parlCaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-2 inline-flex items-center gap-1"
                  >
                    View on parl.ca
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              )
            })}
            {bills.length > 10 && (
              <p className="text-sm text-gray-500 text-center pt-2">
                Showing 10 of {bills.length} bills
              </p>
            )}
          </div>
        )}
      </div>

      {/* Petitions Sponsored */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">
          Petitions Sponsored ({petitions.length})
        </h2>
        {petitions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No petitions sponsored yet.
          </p>
        ) : (
          <div className="space-y-3">
            {petitions.slice(0, 10).map((petition) => {
              const petitionsUrl = `https://www.ourcommons.ca/Petitions/en/Petition/Details?Petition=${encodeURIComponent(petition.petitionNumber)}`
              return (
                <div
                  key={petition.id}
                  className="border-l-4 border-green-500 pl-4 py-3"
                >
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    {petition.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{petition.petitionNumber}</span>
                    {petition.signatureCount && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span>
                          {petition.signatureCount.toLocaleString()} signatures
                        </span>
                      </>
                    )}
                    {petition.presentedDate && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span>
                          {new Date(petition.presentedDate).toLocaleDateString(
                            'en-CA',
                            {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <a
                    href={petitionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-2 inline-flex items-center gap-1"
                  >
                    View on ourcommons.ca
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              )
            })}
            {petitions.length > 10 && (
              <p className="text-sm text-gray-500 text-center pt-2">
                Showing 10 of {petitions.length} petitions
              </p>
            )}
          </div>
        )}
      </div>

      {/* Committee Participation */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">
          Committee Participation ({committees.length})
        </h2>
        {committees.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No committee participation recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {committees.map((committee) => {
              // Create a URL-friendly committee name for the link
              const committeeSlug = committee.committeeName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
              const committeesUrl = `https://www.ourcommons.ca/Committees/en/${committeeSlug}`
              return (
                <div
                  key={committee.id}
                  className="border-l-4 border-purple-500 pl-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">
                        {committee.committeeName}
                      </h3>
                      {committee.role && (
                        <p className="text-xs text-gray-600 mb-1">
                          Role: {committee.role}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        {committee.meetingCount}
                      </p>
                      <p className="text-xs text-gray-500">meetings</p>
                    </div>
                  </div>
                  <a
                    href={committeesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-2 inline-flex items-center gap-1"
                  >
                    View on ourcommons.ca
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
