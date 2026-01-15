'use client'

import { useState, useEffect } from 'react'
import Fuse from 'fuse.js'
import Image from 'next/image'
import Link from 'next/link'
import { BarChart } from '@tremor/react'

interface MP {
  id: number
  fullName: string
  slug: string
  constituencyName: string
  province: string
  caucusShortName: string | null
  photoUrl: string | null
}

interface Scores {
  overallScore: number
  legislativeActivityScore: number
  fiscalResponsibilityScore: number
  constituentEngagementScore: number
  votingParticipationScore: number
  calculatedAt: Date | string
}

interface VotingStats {
  totalVotes: number
  yeaVotes: number
  nayVotes: number
  absentVotes: number
  participationRate: number
}

interface ComparisonData {
  mp: MP
  scores: Scores | null
  voting: VotingStats
  billsSponsored: number
  petitionsSponsored: number
  committees: number
  committeeMeetings: number
  expensesTotal: number
}

export function CompareMPsClient() {
  const [selectedMPs, setSelectedMPs] = useState<MP[]>([])
  const [comparisonData, setComparisonData] = useState<ComparisonData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch comparison data when MPs are selected
  useEffect(() => {
    if (selectedMPs.length === 0) {
      setComparisonData([])
      return
    }

    const fetchComparisonData = async () => {
      setLoading(true)
      setError(null)

      try {
        const mpIds = selectedMPs.map((mp) => mp.id).join(',')
        const response = await fetch(`/api/mp/compare?mpIds=${mpIds}`)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch comparison data')
        }

        const data = await response.json()
        setComparisonData(data.comparison || [])
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load comparison data'
        )
        console.error('Error fetching comparison data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchComparisonData()
  }, [selectedMPs])

  const handleAddMP = (mp: MP) => {
    if (selectedMPs.length >= 10) {
      setError('Maximum 10 MPs can be compared at once')
      return
    }

    if (selectedMPs.some((selected) => selected.id === mp.id)) {
      setError('This MP is already in the comparison')
      return
    }

    setSelectedMPs([...selectedMPs, mp])
    setError(null)
  }

  const handleRemoveMP = (mpId: number) => {
    setSelectedMPs(selectedMPs.filter((mp) => mp.id !== mpId))
  }

  const handleClearAll = () => {
    setSelectedMPs([])
    setError(null)
  }

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    if (score >= 40) return 'text-orange-600'
    return 'text-red-600'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100'
    if (score >= 60) return 'bg-yellow-100'
    if (score >= 40) return 'bg-orange-100'
    return 'bg-red-100'
  }

  // Prepare chart data
  const scoresChartData = comparisonData.map((data) => ({
    MP: data.mp.fullName.split(' ').pop() || data.mp.fullName, // Last name for brevity
    'Overall Score': data.scores?.overallScore || 0,
  }))

  // Prepare sub-scores chart data - one row per MP with all sub-scores
  const subScoresChartData = comparisonData.map((data) => ({
    MP: data.mp.fullName.split(' ').pop() || data.mp.fullName,
    'Legislative Activity': data.scores?.legislativeActivityScore || 0,
    'Fiscal Responsibility': data.scores?.fiscalResponsibilityScore || 0,
    'Constituent Engagement': data.scores?.constituentEngagementScore || 0,
    'Voting Participation': data.scores?.votingParticipationScore || 0,
  }))

  const votingChartData = comparisonData.map((data) => ({
    MP: data.mp.fullName.split(' ').pop() || data.mp.fullName,
    'Participation Rate': data.voting.participationRate,
  }))

  const activityChartData = comparisonData.map((data) => ({
    MP: data.mp.fullName.split(' ').pop() || data.mp.fullName,
    'Bills': data.billsSponsored,
    'Petitions': data.petitionsSponsored,
    'Committees': data.committees,
  }))

  return (
    <div className="space-y-6">
      {/* MP Selector */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Select MPs to Compare</h2>
        <p className="text-sm text-gray-600 mb-4">
          Add up to 10 MPs to compare their performance side-by-side.
        </p>

        {/* MP Search and Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search and add MPs to compare:
          </label>
          <MPSelector onSelect={handleAddMP} excludeIds={selectedMPs.map((mp) => mp.id)} />
        </div>

        {/* Selected MPs */}
        {selectedMPs.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">
                Selected MPs ({selectedMPs.length}/10)
              </h3>
              <button
                onClick={handleClearAll}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedMPs.map((mp) => (
                <div
                  key={mp.id}
                  className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2"
                >
                  {mp.photoUrl && (
                    <Image
                      src={mp.photoUrl}
                      alt={mp.fullName}
                      width={32}
                      height={32}
                      sizes="32px"
                      className="rounded-full object-cover"
                    />
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {mp.fullName.split(' ').pop()}
                  </span>
                  <button
                    onClick={() => handleRemoveMP(mp.id)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label={`Remove ${mp.fullName}`}
                  >
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Comparison Results */}
      {!loading && comparisonData.length > 0 && (
        <div className="space-y-6">
          {/* Overall Scores Comparison */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Overall Accountability Scores</h2>
            {scoresChartData.length > 0 && (
              <BarChart
                data={scoresChartData}
                index="MP"
                categories={['Overall Score']}
                colors={['blue']}
                valueFormatter={(value) => `${Math.round(value)}`}
                yAxisWidth={60}
                className="h-64"
              />
            )}
          </div>

          {/* Sub-scores Comparison */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Sub-Scores Breakdown</h2>
            <BarChart
              data={subScoresChartData}
              index="MP"
              categories={['Legislative Activity', 'Fiscal Responsibility', 'Constituent Engagement', 'Voting Participation']}
              colors={['indigo', 'blue', 'cyan', 'teal']}
              valueFormatter={(value) => `${Math.round(value)}`}
              yAxisWidth={60}
              className="h-80"
            />
          </div>

          {/* Voting Participation */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Voting Participation</h2>
            <BarChart
              data={votingChartData}
              index="MP"
              categories={['Participation Rate']}
              colors={['green']}
              valueFormatter={(value) => `${value}%`}
              yAxisWidth={60}
              className="h-64"
            />
          </div>

          {/* Activity Comparison */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Legislative Activity</h2>
            <BarChart
              data={activityChartData}
              index="MP"
              categories={['Bills', 'Petitions', 'Committees']}
              colors={['blue', 'green', 'purple']}
              valueFormatter={(value) => `${value}`}
              yAxisWidth={60}
              className="h-64"
            />
          </div>

          {/* Detailed Comparison Table */}
          <div className="bg-white rounded-lg shadow-sm p-6 overflow-x-auto">
            <h2 className="text-xl font-semibold mb-4">Detailed Comparison</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      MP
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Overall Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Voting Participation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bills
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Petitions
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Committees
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expenses (FY)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {comparisonData.map((data) => (
                    <tr key={data.mp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {data.mp.photoUrl && (
                            <Image
                              src={data.mp.photoUrl}
                              alt={data.mp.fullName}
                              width={40}
                              height={40}
                              sizes="40px"
                              className="rounded-full object-cover"
                            />
                          )}
                          <div>
                            <Link
                              href={`/mp/${data.mp.slug}`}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800"
                            >
                              {data.mp.fullName}
                            </Link>
                            <p className="text-xs text-gray-500">
                              {data.mp.constituencyName}, {data.mp.province}
                            </p>
                            {data.mp.caucusShortName && (
                              <p className="text-xs text-gray-400">
                                {data.mp.caucusShortName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {data.scores ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-lg font-bold ${getScoreColor(
                                data.scores.overallScore
                              )}`}
                            >
                              {Math.round(data.scores.overallScore)}
                            </span>
                            <div className="w-16 h-2 rounded-full bg-gray-200">
                              <div
                                className={`h-2 rounded-full ${getScoreBgColor(
                                  data.scores.overallScore
                                )}`}
                                style={{
                                  width: `${data.scores.overallScore}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div>
                          <span className="text-sm font-medium text-gray-900">
                            {data.voting.participationRate}%
                          </span>
                          <p className="text-xs text-gray-500">
                            {data.voting.totalVotes - data.voting.absentVotes} /{' '}
                            {data.voting.totalVotes} votes
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {data.billsSponsored}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {data.petitionsSponsored}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {data.committees} ({data.committeeMeetings} meetings)
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${data.expensesTotal.toLocaleString('en-CA', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && comparisonData.length === 0 && selectedMPs.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No MPs selected
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Search and add MPs above to start comparing their performance.
          </p>
        </div>
      )}
    </div>
  )
}

// Custom MP Selector component that allows adding to comparison
function MPSelector({
  onSelect,
  excludeIds,
}: {
  onSelect: (mp: MP) => void
  excludeIds: number[]
}) {
  const [query, setQuery] = useState('')
  const [mps, setMps] = useState<MP[]>([])
  const [filteredMps, setFilteredMps] = useState<MP[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  // Load all MPs on mount
  useEffect(() => {
    const loadMPs = async () => {
      try {
        const response = await fetch('/api/mp/search?q=&limit=338')
        if (response.ok) {
          const data = await response.json()
          setMps(data.results || [])
        }
      } catch (error) {
        console.error('Failed to load MPs:', error)
      }
    }
    loadMPs()
  }, [])

  // Fuzzy search with Fuse.js
  useEffect(() => {
    if (!query.trim()) {
      setFilteredMps([])
      setShowDropdown(false)
      return
    }

    const fuse = new Fuse(mps, {
      keys: ['fullName', 'constituencyName', 'province'],
      threshold: 0.3,
      includeScore: true,
    })

    const results = fuse.search(query)
    const filtered = results
      .map((result) => result.item)
      .filter((mp) => !excludeIds.includes(mp.id))
      .slice(0, 10)
    setFilteredMps(filtered)
    setShowDropdown(filtered.length > 0)
  }, [query, mps, excludeIds])

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (filteredMps.length > 0) setShowDropdown(true)
        }}
        placeholder="Search by MP name or riding..."
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {showDropdown && filteredMps.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {filteredMps.map((mp) => (
            <button
              key={mp.id}
              onClick={() => {
                onSelect(mp)
                setQuery('')
                setShowDropdown(false)
              }}
              className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3"
            >
              {mp.photoUrl && (
                <Image
                  src={mp.photoUrl}
                  alt={mp.fullName}
                  width={40}
                  height={40}
                  sizes="40px"
                  className="rounded-full object-cover"
                />
              )}
              <div>
                <p className="font-medium text-gray-900">{mp.fullName}</p>
                <p className="text-sm text-gray-500">
                  {mp.constituencyName}, {mp.province}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

