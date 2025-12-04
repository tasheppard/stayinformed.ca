'use client'

import { useMemo } from 'react'
import { BarChart, DonutChart } from '@tremor/react'

interface Expense {
  id: number
  fiscalYear: number
  quarter: number
  category: string
  amount: string
  description: string | null
}

interface ExpensesTabProps {
  mpId: number
  slug: string
  expenses: Expense[]
  partyAverage?: number
  nationalAverage?: number
}

export function ExpensesTab({
  mpId,
  slug,
  expenses,
  partyAverage,
  nationalAverage,
}: ExpensesTabProps) {
  // Get current fiscal year (April 1 to March 31)
  const getCurrentFiscalYear = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1 // 1-12
    // Fiscal year starts April 1, so if month >= 4, it's the current year's fiscal year
    // Otherwise it's the previous year's fiscal year
    return month >= 4 ? year : year - 1
  }

  const currentFiscalYear = getCurrentFiscalYear()

  // Calculate totals by category for current fiscal year
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    expenses
      .filter((e) => e.fiscalYear === currentFiscalYear)
      .forEach((expense) => {
        const amount = Number(expense.amount)
        totals[expense.category] = (totals[expense.category] || 0) + amount
      })
    return totals
  }, [expenses, currentFiscalYear])

  // Calculate total expenses for current fiscal year
  const currentYearTotal = useMemo(() => {
    return expenses
      .filter((e) => e.fiscalYear === currentFiscalYear)
      .reduce((sum, expense) => sum + Number(expense.amount), 0)
  }, [expenses, currentFiscalYear])

  // Prepare data for category breakdown chart
  const categoryChartData = useMemo(() => {
    return Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        name: category,
        value: amount,
      }))
      .sort((a, b) => b.value - a.value)
  }, [categoryTotals])

  // Prepare data for quarter-over-quarter trend
  const quarterlyData = useMemo(() => {
    const quarterly: Record<string, number> = {}
    expenses
      .filter((e) => e.fiscalYear === currentFiscalYear)
      .forEach((expense) => {
        const key = `Q${expense.quarter}`
        quarterly[key] = (quarterly[key] || 0) + Number(expense.amount)
      })
    return Object.entries(quarterly)
      .map(([quarter, amount]) => ({
        quarter,
        amount,
      }))
      .sort((a, b) => a.quarter.localeCompare(b.quarter))
  }, [expenses, currentFiscalYear])

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Get color for category (for donut chart)
  const getCategoryColor = (index: number) => {
    const colors = [
      'blue',
      'green',
      'yellow',
      'purple',
      'pink',
      'indigo',
      'cyan',
      'orange',
      'red',
      'teal',
    ]
    return colors[index % colors.length]
  }

  // Get Tailwind color for progress bars
  const getTailwindColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-cyan-500',
      'bg-orange-500',
      'bg-red-500',
      'bg-teal-500',
    ]
    return colors[index % colors.length]
  }

  const getTailwindColorHex = (index: number) => {
    const colors = [
      '#3b82f6', // blue-500
      '#10b981', // green-500
      '#eab308', // yellow-500
      '#a855f7', // purple-500
      '#ec4899', // pink-500
      '#6366f1', // indigo-500
      '#06b6d4', // cyan-500
      '#f97316', // orange-500
      '#ef4444', // red-500
      '#14b8a6', // teal-500
    ]
    return colors[index % colors.length]
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">
              Total Expenses (FY {currentFiscalYear})
            </h3>
            <a
              href={`https://www.ourcommons.ca/ProactiveDisclosure/en/members/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
            >
              Source
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
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(currentYearTotal)}
          </p>
        </div>
        {partyAverage !== undefined && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              Party Average
            </h3>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(partyAverage)}
            </p>
            <p
              className={`text-sm mt-1 ${
                currentYearTotal > partyAverage
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {currentYearTotal > partyAverage ? '+' : ''}
              {formatCurrency(currentYearTotal - partyAverage)} vs average
            </p>
          </div>
        )}
        {nationalAverage !== undefined && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              National Average
            </h3>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(nationalAverage)}
            </p>
            <p
              className={`text-sm mt-1 ${
                currentYearTotal > nationalAverage
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {currentYearTotal > nationalAverage ? '+' : ''}
              {formatCurrency(currentYearTotal - nationalAverage)} vs average
            </p>
          </div>
        )}
      </div>

      {/* Category Breakdown Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Expenses by Category</h2>
        {categoryChartData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <DonutChart
                data={categoryChartData}
                category="value"
                index="name"
                valueFormatter={(value) => formatCurrency(value)}
                colors={categoryChartData.map((_, i) => getCategoryColor(i))}
                className="h-64"
              />
            </div>
            <div className="space-y-3">
              {categoryChartData.map((item, index) => {
                const percentage =
                  (item.value / currentYearTotal) * 100
                return (
                  <div key={item.name} className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded ${getTailwindColor(index)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.name}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 ml-2">
                          {formatCurrency(item.value)}
                        </p>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getTailwindColor(index)}`}
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {percentage.toFixed(1)}% of total
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            No expense data available for fiscal year {currentFiscalYear}.
          </p>
        )}
      </div>

      {/* Quarter-over-Quarter Trend */}
      {quarterlyData.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">
            Quarterly Trend (FY {currentFiscalYear})
          </h2>
          <BarChart
            data={quarterlyData}
            index="quarter"
            categories={['amount']}
            colors={['blue']}
            valueFormatter={(value) => formatCurrency(value)}
            yAxisWidth={80}
            className="h-64"
          />
        </div>
      )}

      {/* Detailed Expense List */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Expenses</h2>
        {expenses.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No expense data available.
          </p>
        ) : (
          <div className="space-y-3">
            {expenses
              .filter((e) => e.fiscalYear === currentFiscalYear)
              .slice(0, 10)
              .map((expense) => (
                <div
                  key={expense.id}
                  className="border-l-4 border-blue-500 pl-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {expense.category}
                      </p>
                      {expense.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {expense.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        FY {expense.fiscalYear} - {expense.quarter}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 whitespace-nowrap">
                      {formatCurrency(Number(expense.amount))}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
