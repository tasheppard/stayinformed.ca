/**
 * Utility functions for sanitizing and formatting text data from XML sources
 */

/**
 * Sanitize text by trimming and removing extra whitespace
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * Check if a string is already in proper title case
 * (not ALL CAPS, not all lowercase, has mixed case)
 */
function isTitleCase(text: string): boolean {
  if (!text || text.length === 0) return false
  
  // Check if it's all uppercase
  if (text === text.toUpperCase()) return false
  
  // Check if it's all lowercase
  if (text === text.toLowerCase()) return false
  
  // Check if first letter of each word is uppercase
  const words = text.split(/\s+/)
  for (const word of words) {
    if (word.length > 0 && word[0] !== word[0].toUpperCase()) {
      return false
    }
  }
  
  return true
}

/**
 * Convert a string to proper title case
 * Handles edge cases like ALL CAPS, mixed case, etc.
 */
export function toTitleCase(text: string | null | undefined): string {
  if (!text) return ''
  
  const sanitized = sanitizeText(text)
  if (!sanitized) return ''
  
  // If already in title case, preserve it
  if (isTitleCase(sanitized)) {
    return sanitized
  }
  
  // Split by spaces and hyphens to handle compound names
  const words = sanitized.split(/([\s-]+)/)
  const titleCased = words.map((word, index) => {
    // Preserve separators (spaces, hyphens)
    if (/^[\s-]+$/.test(word)) {
      return word
    }
    
    // Handle special cases
    // Don't capitalize certain words in the middle (unless it's the first word)
    const lowercaseWords = ['de', 'du', 'la', 'le', 'van', 'von', 'of', 'the']
    if (
      index > 0 &&
      lowercaseWords.includes(word.toLowerCase()) &&
      index < words.length - 1
    ) {
      return word.toLowerCase()
    }
    
    // Capitalize first letter, lowercase the rest
    if (word.length === 0) return word
    if (word.length === 1) return word.toUpperCase()
    
    return word[0].toUpperCase() + word.slice(1).toLowerCase()
  })
  
  return titleCased.join('')
}

/**
 * Sanitize and title case a name (first name, last name, full name)
 */
export function sanitizeName(name: string | null | undefined): string {
  return toTitleCase(name)
}

/**
 * Sanitize and title case a constituency name
 */
export function sanitizeConstituencyName(
  constituencyName: string | null | undefined
): string {
  return toTitleCase(constituencyName)
}

/**
 * Sanitize and title case a caucus/party name
 */
export function sanitizeCaucusName(
  caucusName: string | null | undefined
): string {
  return toTitleCase(caucusName)
}

/**
 * Sanitize a text field (trim and normalize whitespace only, no title case)
 * Use this for fields that should preserve their original casing
 */
export function sanitizeTextField(text: string | null | undefined): string {
  return sanitizeText(text)
}

/**
 * Check if existing data is clean (already sanitized and title cased)
 * This helps avoid overwriting clean data with raw XML formatting
 */
export function isCleanData(
  existing: string | null | undefined,
  raw: string | null | undefined
): boolean {
  if (!existing || !raw) return false
  
  const sanitizedRaw = toTitleCase(raw)
  const sanitizedExisting = sanitizeText(existing)
  
  // If they're the same after sanitization, the existing data is clean
  return sanitizedExisting === sanitizedRaw || existing === sanitizedRaw
}

/**
 * Smart merge: use existing data if it's clean, otherwise use sanitized raw data
 */
export function smartMergeText(
  existing: string | null | undefined,
  raw: string | null | undefined
): string {
  // If no existing data, return sanitized raw
  if (!existing) {
    return toTitleCase(raw)
  }
  
  // If existing data is clean, preserve it
  if (isCleanData(existing, raw)) {
    return existing
  }
  
  // Otherwise, use sanitized raw data
  return toTitleCase(raw)
}

