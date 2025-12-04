import Image from 'next/image'
import Link from 'next/link'

interface MPCardProps {
  id: number
  fullName: string
  slug: string
  constituencyName: string
  province: string
  caucusShortName?: string | null
  photoUrl?: string | null
  overallScore?: number | null
  className?: string
  onClick?: () => void
}

export function MPCard({
  id,
  fullName,
  slug,
  constituencyName,
  province,
  caucusShortName,
  photoUrl,
  overallScore,
  className = '',
  onClick,
}: MPCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50'
    if (score >= 40) return 'text-orange-600 bg-orange-50'
    return 'text-red-600 bg-red-50'
  }

  const content = (
    <div
      className={`bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all p-4 ${className}`}
    >
      <div className="flex items-start gap-4">
        {/* MP Photo */}
        <div className="flex-shrink-0">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={fullName}
              width={64}
              height={64}
              className="rounded-lg object-cover border border-gray-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center">
              <span className="text-gray-400 text-xl">📷</span>
            </div>
          )}
        </div>

        {/* MP Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 mb-1 truncate">
            {fullName}
          </h3>
          <p className="text-sm text-gray-600 mb-1 truncate">
            {constituencyName}, {province}
          </p>
          {caucusShortName && (
            <p className="text-xs text-gray-500 mb-2">{caucusShortName}</p>
          )}
          {overallScore !== null && overallScore !== undefined && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-medium text-gray-500">
                Score:
              </span>
              <span
                className={`text-sm font-bold px-2 py-0.5 rounded ${getScoreColor(
                  overallScore
                )}`}
              >
                {Math.round(overallScore)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg"
        aria-label={`View ${fullName}'s profile`}
      >
        {content}
      </button>
    )
  }

  return (
    <Link
      href={`/mp/${slug}`}
      className="block focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg"
      aria-label={`View ${fullName}'s profile`}
    >
      {content}
    </Link>
  )
}

