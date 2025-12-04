'use client'

import { useState, useMemo } from 'react'

interface Vote {
  id: number
  voteNumber: number
  session: string
  date: Date | string
  billNumber: string | null
  billTitle: string | null
  voteResult: string
}

interface VotingRecordTabProps {
  mpId: number
  slug: string
  votes: Vote[]
}

type VoteTypeFilter = 'all' | 'Yea' | 'Nay' | 'Paired' | 'Abstained'

export function VotingRecordTab({ mpId, slug, votes }: VotingRecordTabProps) {
  const [voteTypeFilter, setVoteTypeFilter] = useState<VoteTypeFilter>('all')
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '30' | '90' | '365'>('all')

  // Filter votes based on selected filters
  const filteredVotes = useMemo(() => {
    let filtered = [...votes]

    // Filter by vote type
    if (voteTypeFilter !== 'all') {
      filtered = filtered.filter((vote) => vote.voteResult === voteTypeFilter)
    }

    // Filter by date range
    if (dateRangeFilter !== 'all') {
      const daysAgo = parseInt(dateRangeFilter)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo)
      filtered = filtered.filter((vote) => {
        const voteDate = new Date(vote.date)
        return voteDate >= cutoffDate
      })
    }

    return filtered
  }, [votes, voteTypeFilter, dateRangeFilter])

  const getVoteColor = (voteResult: string) => {
    switch (voteResult) {
      case 'Yea':
        return {
          border: 'border-green-500',
          bg: 'bg-green-50',
          text: 'text-green-800',
          badge: 'bg-green-100 text-green-800',
        }
      case 'Nay':
        return {
          border: 'border-red-500',
          bg: 'bg-red-50',
          text: 'text-red-800',
          badge: 'bg-red-100 text-red-800',
        }
      case 'Abstained':
      case 'Paired':
        return {
          border: 'border-yellow-500',
          bg: 'bg-yellow-50',
          text: 'text-yellow-800',
          badge: 'bg-yellow-100 text-yellow-800',
        }
      default:
        return {
          border: 'border-gray-500',
          bg: 'bg-gray-50',
          text: 'text-gray-800',
          badge: 'bg-gray-100 text-gray-800',
        }
    }
  }

  const getParlCaUrl = (billNumber: string | null) => {
    if (!billNumber) return null
    // Format: https://www.parl.ca/LegisInfo/BillDetails.aspx?billId=...
    // Bill numbers are typically like C-123, S-45, etc.
    return `https://www.parl.ca/LegisInfo/BillDetails.aspx?billId=${encodeURIComponent(billNumber)}`
  }

  // Count votes by type
  const voteCounts = useMemo(() => {
    return {
      all: votes.length,
      Yea: votes.filter((v) => v.voteResult === 'Yea').length,
      Nay: votes.filter((v) => v.voteResult === 'Nay').length,
      Abstained: votes.filter((v) => v.voteResult === 'Abstained').length,
      Paired: votes.filter((v) => v.voteResult === 'Paired').length,
    }
  }, [votes])

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Voting Record</h2>

        {/* Vote Type Filter */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Vote Type
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setVoteTypeFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                voteTypeFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({voteCounts.all})
            </button>
            <button
              onClick={() => setVoteTypeFilter('Yea')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                voteTypeFilter === 'Yea'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Yea ({voteCounts.Yea})
            </button>
            <button
              onClick={() => setVoteTypeFilter('Nay')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                voteTypeFilter === 'Nay'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Nay ({voteCounts.Nay})
            </button>
            <button
              onClick={() => setVoteTypeFilter('Abstained')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                voteTypeFilter === 'Abstained'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Abstained ({voteCounts.Abstained})
            </button>
            {voteCounts.Paired > 0 && (
              <button
                onClick={() => setVoteTypeFilter('Paired')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  voteTypeFilter === 'Paired'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Paired ({voteCounts.Paired})
              </button>
            )}
          </div>
        </div>

        {/* Date Range Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date Range
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDateRangeFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRangeFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setDateRangeFilter('30')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRangeFilter === '30'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setDateRangeFilter('90')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRangeFilter === '90'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 90 Days
            </button>
            <button
              onClick={() => setDateRangeFilter('365')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRangeFilter === '365'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last Year
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredVotes.length} of {votes.length} votes
        </div>
      </div>

      {/* Votes List */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {filteredVotes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No votes found matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredVotes.map((vote) => {
              const colors = getVoteColor(vote.voteResult)
              const parlCaUrl = getParlCaUrl(vote.billNumber)
              const voteDate = new Date(vote.date)

              return (
                <div
                  key={vote.id}
                  className={`border-l-4 ${colors.border} ${colors.bg} pl-4 py-4 rounded-r-lg`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3 mb-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${colors.badge} flex-shrink-0`}
                        >
                          {vote.voteResult}
                        </span>
                        <div className="flex-1 min-w-0">
                          {vote.billTitle ? (
                            <h3 className="text-base font-semibold text-gray-900 mb-1">
                              {vote.billTitle}
                            </h3>
                          ) : (
                            <h3 className="text-base font-semibold text-gray-900 mb-1">
                              Vote #{vote.voteNumber}
                            </h3>
                          )}
                          {vote.billNumber && (
                            <p className="text-sm text-gray-600 mb-1">
                              Bill {vote.billNumber}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span>
                              {voteDate.toLocaleDateString('en-CA', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span>Session {vote.session}</span>
                            <span className="text-gray-300">•</span>
                            <span>Vote #{vote.voteNumber}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {parlCaUrl && (
                    <div className="mt-3">
                      <a
                        href={parlCaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                      >
                        View on parl.ca
                        <svg
                          className="w-4 h-4"
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
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
