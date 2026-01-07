/**
 * Utility functions for CSV export
 */

/**
 * Escapes a CSV field value
 */
function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }
  
  const stringValue = String(value)
  
  // If the value contains comma, quote, or any line break character (\r, \n, or \r\n),
  // wrap it in quotes and escape quotes
  // CSV fields with line breaks must always be quoted to prevent parsing errors
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\r') ||
    stringValue.includes('\n')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  
  return stringValue
}

/**
 * Converts an array of objects to CSV format
 */
export function convertToCSV<T extends Record<string, any>>(
  data: T[],
  headers: { key: keyof T; label: string }[]
): string {
  if (data.length === 0) {
    return headers.map((h) => escapeCsvField(h.label)).join(',')
  }

  // Create header row
  const headerRow = headers.map((h) => escapeCsvField(h.label)).join(',')

  // Create data rows
  const dataRows = data.map((row) => {
    return headers.map((h) => escapeCsvField(row[h.key])).join(',')
  })

  return [headerRow, ...dataRows].join('\n')
}

/**
 * Formats a date to YYYY-MM-DD in local timezone (not UTC)
 * This matches the format used by toLocaleDateString('en-CA') in the UI
 * to ensure exported dates match displayed dates
 */
export function formatDateLocal(date: Date | string | null | undefined): string {
  if (!date) {
    return ''
  }
  
  const d = new Date(date)
  
  // Use local date components to avoid timezone shifts
  // Format as YYYY-MM-DD to match en-CA locale format
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

/**
 * Generates a filename with timestamp
 */
export function generateFilename(prefix: string, extension: string = 'csv'): string {
  const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD (UTC is fine for filenames)
  return `${prefix}_${timestamp}.${extension}`
}

