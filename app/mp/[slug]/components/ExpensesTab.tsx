'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart, DonutChart } from '@tremor/react'
import { PremiumGate } from '@/components/premium/PremiumGate'
import { CSVExportButton } from '@/components/ui/CSVExportButton'

interface Expense {
  id: number
  fiscalYear: number
  quarter: number
  category: string
  amount: string
  description: string | null
  transactionDetails?: any // JSONB field for premium users
}

interface ExpensesTabProps {
  mpId: number
  slug: string
  expenses: Expense[]
  partyAverage?: number
  nationalAverage?: number
  isPremium: boolean
}

export function ExpensesTab({
  mpId,
  slug,
  expenses,
  partyAverage,
  nationalAverage,
  isPremium,
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

  // For premium users, allow selecting fiscal year or viewing all years
  // For free users, always use current fiscal year
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number | 'all'>(
    isPremium ? 'all' : currentFiscalYear
  )

  // Get available fiscal years (for premium users)
  const availableFiscalYears = useMemo(() => {
    const years = new Set(expenses.map((e) => e.fiscalYear))
    return Array.from(years).sort((a, b) => b - a) // Most recent first
  }, [expenses])

  // Get filtered expenses based on selected fiscal year
  // For free users, always filter to current fiscal year regardless of state
  const filteredExpenses = useMemo(() => {
    if (!isPremium) {
      // Free users always see current fiscal year only
      return expenses.filter((e) => e.fiscalYear === currentFiscalYear)
    }
    // Premium users can view all years or a specific year
    if (selectedFiscalYear === 'all') {
      return expenses
    }
    return expenses.filter((e) => e.fiscalYear === selectedFiscalYear)
  }, [expenses, selectedFiscalYear, isPremium, currentFiscalYear])

  // Calculate totals by category for selected fiscal year(s)
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    filteredExpenses.forEach((expense) => {
      const amount = Number(expense.amount)
      totals[expense.category] = (totals[expense.category] || 0) + amount
    })
    return totals
  }, [filteredExpenses])

  // Calculate total expenses for selected fiscal year(s)
  const selectedYearTotal = useMemo(() => {
    return filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)
  }, [filteredExpenses])

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
  // For premium users viewing all years, group by fiscal year and quarter
  // For single year view, show quarters only
  const quarterlyData = useMemo(() => {
    if (selectedFiscalYear === 'all') {
      // Group by fiscal year and quarter for multi-year view
      const quarterly: Record<string, number> = {}
      filteredExpenses.forEach((expense) => {
        const key = `FY ${expense.fiscalYear} Q${expense.quarter}`
        quarterly[key] = (quarterly[key] || 0) + Number(expense.amount)
      })
      return Object.entries(quarterly)
        .map(([quarter, amount]) => ({
          quarter,
          amount,
        }))
        .sort((a, b) => {
          // Sort by fiscal year (descending) then quarter
          const aMatch = a.quarter.match(/FY (\d+) Q(\d+)/)
          const bMatch = b.quarter.match(/FY (\d+) Q(\d+)/)
          if (aMatch && bMatch) {
            const aYear = parseInt(aMatch[1])
            const bYear = parseInt(bMatch[1])
            if (aYear !== bYear) return bYear - aYear
            return parseInt(aMatch[2]) - parseInt(bMatch[2])
          }
          return a.quarter.localeCompare(b.quarter)
        })
    } else {
      // Single year view - show quarters only
      const quarterly: Record<string, number> = {}
      filteredExpenses.forEach((expense) => {
        const key = `Q${expense.quarter}`
        quarterly[key] = (quarterly[key] || 0) + Number(expense.amount)
      })
      return Object.entries(quarterly)
        .map(([quarter, amount]) => ({
          quarter,
          amount,
        }))
        .sort((a, b) => a.quarter.localeCompare(b.quarter))
    }
  }, [filteredExpenses, selectedFiscalYear])

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
      {/* Fiscal Year Selector (Premium Only) */}
      {isPremium && availableFiscalYears.length > 1 && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">
              Fiscal Year:
            </label>
            <select
              value={selectedFiscalYear}
              onChange={(e) =>
                setSelectedFiscalYear(
                  e.target.value === 'all' ? 'all' : parseInt(e.target.value)
                )
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Years</option>
              {availableFiscalYears.map((year) => (
                <option key={year} value={year}>
                  FY {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Historical Data Notice for Free Users */}
      {!isPremium && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg
                className="w-5 h-5 text-blue-600 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700 mb-3">
                You're viewing expenses from the current fiscal year (FY {currentFiscalYear}) only.{' '}
                <span className="font-medium">Upgrade to Premium</span> to access historical expense data from past fiscal years.
              </p>
              <Link
                href="/subscribe"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Upgrade to Premium →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">
              Total Expenses
              {selectedFiscalYear === 'all' ? ' (All Years)' : ` (FY ${selectedFiscalYear})`}
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
            {formatCurrency(selectedYearTotal)}
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
                selectedYearTotal > partyAverage
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {selectedYearTotal > partyAverage ? '+' : ''}
              {formatCurrency(selectedYearTotal - partyAverage)} vs average
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
                selectedYearTotal > nationalAverage
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {selectedYearTotal > nationalAverage ? '+' : ''}
              {formatCurrency(selectedYearTotal - nationalAverage)} vs average
            </p>
          </div>
        )}
      </div>

      {/* Category Breakdown Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            Expenses by Category
            {selectedFiscalYear === 'all' ? ' (All Years)' : ` (FY ${selectedFiscalYear})`}
          </h2>
          <CSVExportButton slug={slug} exportType="expenses" />
        </div>
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
                  (item.value / selectedYearTotal) * 100
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
            No expense data available{selectedFiscalYear !== 'all' ? ` for fiscal year ${selectedFiscalYear}` : ''}.
          </p>
        )}
      </div>

      {/* Quarter-over-Quarter Trend */}
      {quarterlyData.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">
            Quarterly Trend
            {selectedFiscalYear === 'all' ? ' (All Years)' : ` (FY ${selectedFiscalYear})`}
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            {selectedFiscalYear === 'all' ? 'All Expenses' : 'Recent Expenses'}
          </h2>
          {!isPremium && (
            <span className="text-xs text-gray-500">
              Current fiscal year only
            </span>
          )}
        </div>
        {filteredExpenses.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No expense data available{selectedFiscalYear !== 'all' ? ` for fiscal year ${selectedFiscalYear}` : ''}.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredExpenses
              .slice(0, selectedFiscalYear === 'all' ? 50 : 10)
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
                        FY {expense.fiscalYear} - Q{expense.quarter}
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

      {/* Detailed Transaction Breakdown (Premium Only) */}
      <PremiumGate
        featureName="Detailed Expense Transactions"
        message="View detailed transaction breakdowns with individual line items, vendors, and dates. Upgrade to Premium to access this feature."
      >
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">
            Detailed Transaction Breakdown
          </h2>
          {filteredExpenses.filter((e) => e.transactionDetails).length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No detailed transaction data available{selectedFiscalYear !== 'all' ? ` for fiscal year ${selectedFiscalYear}` : ''}. Detailed breakdowns are added as they become available from official sources.
            </p>
          ) : (
            <div className="space-y-4">
              {filteredExpenses
                .filter((e) => e.transactionDetails)
                .map((expense) => {
                  const details = expense.transactionDetails
                  if (!details || !Array.isArray(details)) return null

                  return (
                    <div
                      key={expense.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {expense.category}
                          </p>
                          <p className="text-xs text-gray-500">
                            FY {expense.fiscalYear} - Q{expense.quarter} • Total: {formatCurrency(Number(expense.amount))}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {details.map((transaction: any, idx: number) => (
                          <div
                            key={idx}
                            className="bg-gray-50 rounded p-3 text-sm"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                {transaction.vendor && (
                                  <p className="font-medium text-gray-900">
                                    {transaction.vendor}
                                  </p>
                                )}
                                {transaction.description && (
                                  <p className="text-gray-600 mt-1">
                                    {transaction.description}
                                  </p>
                                )}
                                {transaction.date && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    {new Date(transaction.date).toLocaleDateString('en-CA', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </p>
                                )}
                              </div>
                              {transaction.amount && (
                                <p className="font-semibold text-gray-900 whitespace-nowrap">
                                  {formatCurrency(Number(transaction.amount))}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </PremiumGate>
    </div>
  )
}
