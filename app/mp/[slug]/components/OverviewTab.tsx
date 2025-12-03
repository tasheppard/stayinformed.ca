interface OverviewTabProps {
  mpId: number
  slug: string
}

export function OverviewTab({ mpId, slug }: OverviewTabProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-xl font-semibold mb-4">Overview</h2>
      <p className="text-gray-600">
        Overview content will be displayed here. This tab will show MP photo,
        contact info, accountability scores, and recent activity.
      </p>
    </div>
  )
}
