/**
 * Unit tests for data sanitization utility functions
 * To run: npx jest lib/utils/data-sanitization.test.ts
 */

import {
  sanitizeText,
  toTitleCase,
  sanitizeName,
  sanitizeConstituencyName,
  sanitizeCaucusName,
  sanitizeTextField,
  isCleanData,
  smartMergeText,
} from './data-sanitization'

describe('sanitizeText', () => {
  it('should trim whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello')
  })

  it('should remove extra whitespace', () => {
    expect(sanitizeText('hello    world')).toBe('hello world')
  })

  it('should handle null and undefined', () => {
    expect(sanitizeText(null)).toBe('')
    expect(sanitizeText(undefined)).toBe('')
  })

  it('should handle empty string', () => {
    expect(sanitizeText('')).toBe('')
  })

  it('should handle tabs and newlines', () => {
    expect(sanitizeText('hello\t\tworld\n\n')).toBe('hello world')
  })
})

describe('toTitleCase', () => {
  it('should convert ALL CAPS to title case', () => {
    expect(toTitleCase('JOHN SMITH')).toBe('John Smith')
  })

  it('should convert all lowercase to title case', () => {
    expect(toTitleCase('john smith')).toBe('John Smith')
  })

  it('should preserve existing title case', () => {
    expect(toTitleCase('John Smith')).toBe('John Smith')
  })

  it('should handle mixed case', () => {
    expect(toTitleCase('jOhN sMiTh')).toBe('John Smith')
  })

  it('should handle names with hyphens', () => {
    expect(toTitleCase('JEAN-YVES BLANCHET')).toBe('Jean-Yves Blanchet')
    expect(toTitleCase('xavier barsalou-duval')).toBe('Xavier Barsalou-Duval')
  })

  it('should handle multiple words', () => {
    expect(toTitleCase('MARY JANE WATSON')).toBe('Mary Jane Watson')
  })

  it('should handle special words in middle', () => {
    expect(toTitleCase('JOHN DE SMITH')).toBe('John de Smith')
    expect(toTitleCase('MARIE VAN DER BERG')).toBe('Marie van der Berg')
  })

  it('should capitalize first word even if it is a special word', () => {
    expect(toTitleCase('DE SMITH')).toBe('De Smith')
  })

  it('should handle null and undefined', () => {
    expect(toTitleCase(null)).toBe('')
    expect(toTitleCase(undefined)).toBe('')
  })

  it('should handle empty string', () => {
    expect(toTitleCase('')).toBe('')
  })

  it('should handle single character', () => {
    expect(toTitleCase('a')).toBe('A')
    expect(toTitleCase('A')).toBe('A')
  })
})

describe('sanitizeName', () => {
  it('should sanitize and title case a name', () => {
    expect(sanitizeName('  john   smith  ')).toBe('John Smith')
    expect(sanitizeName('JOHN SMITH')).toBe('John Smith')
    expect(sanitizeName('john smith')).toBe('John Smith')
  })

  it('should handle null and undefined', () => {
    expect(sanitizeName(null)).toBe('')
    expect(sanitizeName(undefined)).toBe('')
  })
})

describe('sanitizeConstituencyName', () => {
  it('should sanitize and title case constituency name', () => {
    expect(sanitizeConstituencyName('  toronto centre  ')).toBe('Toronto Centre')
    expect(sanitizeConstituencyName('TORONTO CENTRE')).toBe('Toronto Centre')
  })

  it('should handle null and undefined', () => {
    expect(sanitizeConstituencyName(null)).toBe('')
    expect(sanitizeConstituencyName(undefined)).toBe('')
  })
})

describe('sanitizeCaucusName', () => {
  it('should sanitize and title case caucus name', () => {
    expect(sanitizeCaucusName('  liberal party  ')).toBe('Liberal Party')
    expect(sanitizeCaucusName('CONSERVATIVE PARTY')).toBe('Conservative Party')
  })

  it('should handle null and undefined', () => {
    expect(sanitizeCaucusName(null)).toBe('')
    expect(sanitizeCaucusName(undefined)).toBe('')
  })
})

describe('sanitizeTextField', () => {
  it('should sanitize without title case', () => {
    expect(sanitizeTextField('  hello   world  ')).toBe('hello world')
    expect(sanitizeTextField('HELLO WORLD')).toBe('HELLO WORLD') // Preserves case
  })

  it('should handle null and undefined', () => {
    expect(sanitizeTextField(null)).toBe('')
    expect(sanitizeTextField(undefined)).toBe('')
  })
})

describe('isCleanData', () => {
  it('should return true for clean existing data', () => {
    expect(isCleanData('John Smith', 'John Smith')).toBe(true)
    expect(isCleanData('John Smith', '  john   smith  ')).toBe(true) // After sanitization
  })

  it('should return false for different data', () => {
    expect(isCleanData('John Smith', 'Jane Doe')).toBe(false)
  })

  it('should return false for null/undefined', () => {
    expect(isCleanData(null, 'John Smith')).toBe(false)
    expect(isCleanData('John Smith', null)).toBe(false)
  })
})

describe('smartMergeText', () => {
  it('should use sanitized raw data when no existing data', () => {
    expect(smartMergeText(null, '  john   smith  ')).toBe('John Smith')
    expect(smartMergeText(undefined, 'JOHN SMITH')).toBe('John Smith')
  })

  it('should preserve clean existing data', () => {
    expect(smartMergeText('John Smith', 'John Smith')).toBe('John Smith')
    expect(smartMergeText('John Smith', '  john   smith  ')).toBe('John Smith')
  })

  it('should use sanitized raw data when existing is not clean', () => {
    expect(smartMergeText('john smith', 'JOHN SMITH')).toBe('John Smith')
    expect(smartMergeText('John  Smith', 'John Smith')).toBe('John Smith')
  })

  it('should handle null/undefined gracefully', () => {
    expect(smartMergeText(null, null)).toBe('')
    expect(smartMergeText(undefined, undefined)).toBe('')
    expect(smartMergeText('', '')).toBe('')
  })
})

