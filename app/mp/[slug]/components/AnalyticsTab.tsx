interface AnalyticsTabProps {
  mpId: number
  slug: string
}

export function AnalyticsTab({ mpId, slug }: AnalyticsTabProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-xl font-semibold mb-4">Analytics</h2>
      <p className="text-gray-600">
        Analytics content will be displayed here. This tab will show charts and
        comparison visualizations.
      </p>
    </div>
  )
}
