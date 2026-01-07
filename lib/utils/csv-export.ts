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
  
  // If the value contains comma, quote, or newline, wrap it in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
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
 * Generates a filename with timestamp
 */
export function generateFilename(prefix: string, extension: string = 'csv'): string {
  const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  return `${prefix}_${timestamp}.${extension}`
}

