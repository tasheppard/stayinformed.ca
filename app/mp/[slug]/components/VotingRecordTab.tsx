interface VotingRecordTabProps {
  mpId: number
  slug: string
}

export function VotingRecordTab({ mpId, slug }: VotingRecordTabProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-xl font-semibold mb-4">Voting Record</h2>
      <p className="text-gray-600">
        Voting record content will be displayed here. This tab will show
        chronological vote list with filters.
      </p>
    </div>
  )
}
