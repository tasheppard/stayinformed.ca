interface ExpensesTabProps {
  mpId: number
  slug: string
}

export function ExpensesTab({ mpId, slug }: ExpensesTabProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-xl font-semibold mb-4">Expenses</h2>
      <p className="text-gray-600">
        Expenses content will be displayed here. This tab will show expense
        breakdowns and comparison charts.
      </p>
    </div>
  )
}
