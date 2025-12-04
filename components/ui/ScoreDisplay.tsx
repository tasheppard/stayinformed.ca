interface ScoreDisplayProps {
  overallScore: number
  legislativeActivityScore: number
  fiscalResponsibilityScore: number
  constituentEngagementScore: number
  votingParticipationScore: number
  calculatedAt?: Date | null
}

export function ScoreDisplay({
  overallScore,
  legislativeActivityScore,
  fiscalResponsibilityScore,
  constituentEngagementScore,
  votingParticipationScore,
  calculatedAt,
}: ScoreDisplayProps) {
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

  const formatScore = (score: number) => {
    return Math.round(score).toString()
  }

  return (
    <div className="space-y-6" role="region" aria-label="Accountability scores">
      {/* Overall Score */}
      <div className="text-center">
        <div className="inline-flex flex-col items-center">
          <div
            className={`w-32 h-32 rounded-full ${getScoreBgColor(overallScore)} flex items-center justify-center mb-3`}
            role="img"
            aria-label={`Overall accountability score: ${formatScore(overallScore)} out of 100`}
          >
            <span className={`text-4xl font-bold ${getScoreColor(overallScore)}`}>
              {formatScore(overallScore)}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Overall Score</h3>
          <p className="text-sm text-gray-500">Accountability Rating</p>
        </div>
      </div>

      {/* Sub-scores Grid */}
      <div className="grid grid-cols-2 gap-4" role="list" aria-label="Sub-scores">
        <div className="bg-gray-50 rounded-lg p-4" role="listitem">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Legislative Activity
            </span>
            <span 
              className={`text-lg font-bold ${getScoreColor(legislativeActivityScore)}`}
              aria-label={`Legislative Activity score: ${formatScore(legislativeActivityScore)}`}
            >
              {formatScore(legislativeActivityScore)}
            </span>
          </div>
          <div 
            className="w-full bg-gray-200 rounded-full h-2"
            role="progressbar"
            aria-valuenow={legislativeActivityScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Legislative Activity: ${legislativeActivityScore}%`}
          >
            <div
              className={`h-2 rounded-full ${getScoreBgColor(legislativeActivityScore)}`}
              style={{ width: `${legislativeActivityScore}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">35% weight</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4" role="listitem">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Fiscal Responsibility
            </span>
            <span 
              className={`text-lg font-bold ${getScoreColor(fiscalResponsibilityScore)}`}
              aria-label={`Fiscal Responsibility score: ${formatScore(fiscalResponsibilityScore)}`}
            >
              {formatScore(fiscalResponsibilityScore)}
            </span>
          </div>
          <div 
            className="w-full bg-gray-200 rounded-full h-2"
            role="progressbar"
            aria-valuenow={fiscalResponsibilityScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Fiscal Responsibility: ${fiscalResponsibilityScore}%`}
          >
            <div
              className={`h-2 rounded-full ${getScoreBgColor(fiscalResponsibilityScore)}`}
              style={{ width: `${fiscalResponsibilityScore}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">25% weight</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4" role="listitem">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Constituent Engagement
            </span>
            <span 
              className={`text-lg font-bold ${getScoreColor(constituentEngagementScore)}`}
              aria-label={`Constituent Engagement score: ${formatScore(constituentEngagementScore)}`}
            >
              {formatScore(constituentEngagementScore)}
            </span>
          </div>
          <div 
            className="w-full bg-gray-200 rounded-full h-2"
            role="progressbar"
            aria-valuenow={constituentEngagementScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Constituent Engagement: ${constituentEngagementScore}%`}
          >
            <div
              className={`h-2 rounded-full ${getScoreBgColor(constituentEngagementScore)}`}
              style={{ width: `${constituentEngagementScore}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">25% weight</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4" role="listitem">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Voting Participation
            </span>
            <span 
              className={`text-lg font-bold ${getScoreColor(votingParticipationScore)}`}
              aria-label={`Voting Participation score: ${formatScore(votingParticipationScore)}`}
            >
              {formatScore(votingParticipationScore)}
            </span>
          </div>
          <div 
            className="w-full bg-gray-200 rounded-full h-2"
            role="progressbar"
            aria-valuenow={votingParticipationScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Voting Participation: ${votingParticipationScore}%`}
          >
            <div
              className={`h-2 rounded-full ${getScoreBgColor(votingParticipationScore)}`}
              style={{ width: `${votingParticipationScore}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">15% weight</p>
        </div>
      </div>

      {calculatedAt && (
        <p className="text-xs text-gray-400 text-center">
          Last updated: {new Date(calculatedAt).toLocaleDateString('en-CA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      )}
    </div>
  )
}

