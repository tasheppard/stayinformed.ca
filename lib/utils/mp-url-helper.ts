/**
 * Generate MP URL slug for XML endpoints
 * Format: FirstName-LastName(PersonId)
 * 
 * Examples:
 * - "John Smith" (12345) -> "John-Smith(12345)"
 * - "Jean-Yves Blanchet" (67890) -> "Jean-Yves-Blanchet(67890)"
 * - "Xavier Barsalou-Duval" (11111) -> "Xavier-Barsalou-Duval(11111)"
 */

/**
 * Normalize a name part for URL slug:
 * - Replace spaces with hyphens
 * - Preserve existing hyphens (don't double-hyphenate)
 * - Handle special characters and accents using URL encoding
 */
function normalizeNamePart(name: string): string {
  if (!name) return ''
  
  // Trim whitespace
  let normalized = name.trim()
  
  // Replace spaces with hyphens
  normalized = normalized.replace(/\s+/g, '-')
  
  // Remove any double hyphens that might have been created
  normalized = normalized.replace(/-+/g, '-')
  
  // Remove leading/trailing hyphens
  normalized = normalized.replace(/^-+|-+$/g, '')
  
  // Encode special characters using URL encoding
  // This handles accents (é, è, à, etc.) and special characters
  // We'll encode the whole string, then restore hyphens
  const parts = normalized.split('-')
  const encodedParts = parts.map(part => {
    // Encode each part separately to preserve hyphens
    return encodeURIComponent(part)
  })
  
  // Join with hyphens
  normalized = encodedParts.join('-')
  
  return normalized
}

/**
 * Generate MP URL slug from first name, last name, and personId
 * 
 * @param firstName - MP's first name (e.g., "John", "Jean-Yves", "Xavier")
 * @param lastName - MP's last name (e.g., "Smith", "Blanchet", "Barsalou-Duval")
 * @param personId - PersonId from XML (e.g., "12345")
 * @returns URL slug in format: FirstName-LastName(PersonId)
 * 
 * @example
 * generateMpUrlSlug("John", "Smith", "12345")
 * // Returns: "John-Smith(12345)"
 * 
 * @example
 * generateMpUrlSlug("Jean-Yves", "Blanchet", "67890")
 * // Returns: "Jean-Yves-Blanchet(67890)"
 * 
 * @example
 * generateMpUrlSlug("Xavier", "Barsalou-Duval", "11111")
 * // Returns: "Xavier-Barsalou-Duval(11111)"
 */
export function generateMpUrlSlug(
  firstName: string,
  lastName: string,
  personId: string
): string {
  if (!firstName || !lastName || !personId) {
    throw new Error('firstName, lastName, and personId are required')
  }
  
  const normalizedFirstName = normalizeNamePart(firstName)
  const normalizedLastName = normalizeNamePart(lastName)
  
  // Validate personId is alphanumeric (no special characters that would break URL)
  if (!/^[a-zA-Z0-9]+$/.test(personId)) {
    throw new Error(`Invalid personId format: ${personId}. Must be alphanumeric.`)
  }
  
  // Format: FirstName-LastName(PersonId)
  const slug = `${normalizedFirstName}-${normalizedLastName}(${personId})`
  
  // Validate the final format
  // Allow alphanumeric, hyphens, parentheses, and percent-encoded characters (%XX)
  // Percent encoding is used for accented characters (e.g., é -> %C3%A9)
  if (!/^[a-zA-Z0-9\-()%]+$/.test(slug)) {
    throw new Error(`Generated slug contains invalid characters: ${slug}`)
  }
  
  // Additional validation: if percent encoding is present, ensure it's valid format (%XX)
  if (slug.includes('%')) {
    const percentEncodedPattern = /%[0-9A-Fa-f]{2}/g
    const allPercentChars = slug.match(/%/g) || []
    const validPercentEncodings = slug.match(percentEncodedPattern) || []
    // Each % character must be part of a valid %XX encoding
    if (allPercentChars.length !== validPercentEncodings.length) {
      throw new Error(`Invalid percent encoding in slug: ${slug}`)
    }
  }
  
  return slug
}

/**
 * Validate that a generated slug matches the expected format
 * 
 * @param slug - The URL slug to validate
 * @returns true if valid, false otherwise
 */
export function validateMpUrlSlug(slug: string): boolean {
  // Format: FirstName-LastName(PersonId)
  // Should contain at least one hyphen, and parentheses with alphanumeric content
  // Allow percent-encoded characters (%XX) for accented characters
  const pattern = /^[a-zA-Z0-9\-%]+\([a-zA-Z0-9]+\)$/
  
  if (!pattern.test(slug)) {
    return false
  }
  
  // If percent encoding is present, validate the format
  if (slug.includes('%')) {
    const percentEncodedPattern = /%[0-9A-Fa-f]{2}/g
    const allPercentChars = slug.match(/%/g) || []
    const validPercentEncodings = slug.match(percentEncodedPattern) || []
    // Each % character must be part of a valid %XX encoding
    return allPercentChars.length === validPercentEncodings.length
  }
  
  return true
}

