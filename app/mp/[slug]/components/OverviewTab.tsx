'use client'

import { ScoreDisplay } from '@/components/ui/ScoreDisplay'

interface OverviewTabProps {
  mpId: number
  slug: string
  mpData: any
  scores: any
  recentVotes: any[]
  recentBills: any[]
  recentExpenses: any[]
  recentPetitions: any[]
}

export function OverviewTab({
  mpId,
  slug,
  mpData,
  scores,
  recentVotes,
  recentBills,
  recentExpenses,
  recentPetitions,
}: OverviewTabProps) {
  const mp = mpData
  const latestScores = scores

  return (
    <div className="space-y-6">
      {/* Accountability Scores Section */}
      {latestScores ? (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-6">Accountability Scores</h2>
          <ScoreDisplay
            overallScore={Number(latestScores.overallScore)}
            legislativeActivityScore={Number(latestScores.legislativeActivityScore)}
            fiscalResponsibilityScore={Number(latestScores.fiscalResponsibilityScore)}
            constituentEngagementScore={Number(latestScores.constituentEngagementScore)}
            votingParticipationScore={Number(latestScores.votingParticipationScore)}
            calculatedAt={latestScores.calculatedAt}
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">Accountability Scores</h2>
          <p className="text-gray-500">
            Scores are being calculated. Please check back soon.
          </p>
        </div>
      )}

      {/* Contact Information Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
        <div className="space-y-3">
          {mp.email && (
            <div className="flex items-start">
              <span className="text-gray-500 w-20 flex-shrink-0">Email:</span>
              <a
                href={`mailto:${mp.email}`}
                className="text-blue-600 hover:underline break-all"
              >
                {mp.email}
              </a>
            </div>
          )}
          {mp.phone && (
            <div className="flex items-start">
              <span className="text-gray-500 w-20 flex-shrink-0">Phone:</span>
              <a
                href={`tel:${mp.phone}`}
                className="text-blue-600 hover:underline"
              >
                {mp.phone}
              </a>
            </div>
          )}
          <div className="flex items-start">
            <span className="text-gray-500 w-20 flex-shrink-0">Riding:</span>
            <span className="text-gray-900">
              {mp.constituencyName}, {mp.province}
            </span>
          </div>
          {mp.caucusShortName && (
            <div className="flex items-start">
              <span className="text-gray-500 w-20 flex-shrink-0">Party:</span>
              <span className="text-gray-900">{mp.caucusShortName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Activity (Last 7 Days)</h2>
        <div className="space-y-6">
          {/* Recent Votes */}
          {recentVotes.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Recent Votes ({recentVotes.length})
              </h3>
              <div className="space-y-2">
                {recentVotes.map((vote) => (
                  <div
                    key={vote.id}
                    className="border-l-4 pl-3 py-2"
                    style={{
                      borderColor:
                        vote.voteResult === 'Yea'
                          ? '#10b981'
                          : vote.voteResult === 'Nay'
                          ? '#ef4444'
                          : '#eab308',
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {vote.billTitle || `Vote #${vote.voteNumber}`}
                        </p>
                        {vote.billNumber && (
                          <p className="text-xs text-gray-500">
                            {vote.billNumber}
                          </p>
                        )}
                      </div>
                      <span
                        className="ml-2 px-2 py-1 text-xs font-medium rounded"
                        style={{
                          backgroundColor:
                            vote.voteResult === 'Yea'
                              ? '#d1fae5'
                              : vote.voteResult === 'Nay'
                              ? '#fee2e2'
                              : '#fef3c7',
                          color:
                            vote.voteResult === 'Yea'
                              ? '#065f46'
                              : vote.voteResult === 'Nay'
                              ? '#991b1b'
                              : '#92400e',
                        }}
                      >
                        {vote.voteResult}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(vote.date).toLocaleDateString('en-CA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Bills */}
          {recentBills.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Bills Sponsored ({recentBills.length})
              </h3>
              <div className="space-y-2">
                {recentBills.map((bill) => {
                  const parlCaUrl = bill.billNumber
                    ? `https://www.parl.ca/LegisInfo/BillDetails.aspx?billId=${encodeURIComponent(bill.billNumber)}`
                    : null
                  return (
                    <div key={bill.id} className="border-l-4 border-blue-500 pl-3 py-2">
                      <p className="text-sm font-medium text-gray-900">
                        {bill.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {bill.billNumber}
                        </span>
                        {bill.status && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs text-gray-500">
                              {bill.status}
                            </span>
                          </>
                        )}
                      </div>
                      {parlCaUrl && (
                        <a
                          href={parlCaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 inline-flex items-center gap-1"
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
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent Expenses */}
          {recentExpenses.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Recent Expenses ({recentExpenses.length})
              </h3>
              <div className="space-y-2">
                {recentExpenses.map((expense) => {
                  const expensesUrl = `https://www.ourcommons.ca/ProactiveDisclosure/en/members/${slug}`
                  return (
                    <div
                      key={expense.id}
                      className="border-l-4 border-purple-500 pl-3 py-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {expense.category}
                          </p>
                          {expense.description && (
                            <p className="text-xs text-gray-500 mt-1">
                              {expense.description}
                            </p>
                          )}
                        </div>
                        <span className="ml-2 text-sm font-semibold text-gray-900">
                          ${Number(expense.amount).toLocaleString('en-CA', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-500">
                          FY {expense.fiscalYear} Q{expense.quarter}
                        </p>
                        <a
                          href={expensesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
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
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent Petitions */}
          {recentPetitions.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Petitions Sponsored ({recentPetitions.length})
              </h3>
              <div className="space-y-2">
                {recentPetitions.map((petition) => {
                  const petitionsUrl = `https://www.ourcommons.ca/Petitions/en/Petition/Details?Petition=${encodeURIComponent(petition.petitionNumber)}`
                  return (
                    <div
                      key={petition.id}
                      className="border-l-4 border-green-500 pl-3 py-2"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {petition.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {petition.petitionNumber}
                        </span>
                        {petition.signatureCount && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs text-gray-500">
                              {petition.signatureCount.toLocaleString()} signatures
                            </span>
                          </>
                        )}
                      </div>
                      <a
                        href={petitionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 inline-flex items-center gap-1"
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
            </div>
          )}

          {/* No Recent Activity */}
          {recentVotes.length === 0 &&
            recentBills.length === 0 &&
            recentExpenses.length === 0 &&
            recentPetitions.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">
                  No recent activity in the last 7 days.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
