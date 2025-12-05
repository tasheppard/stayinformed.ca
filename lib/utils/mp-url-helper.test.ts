/**
 * Unit tests for MP URL helper functions
 * To run: npx jest lib/utils/mp-url-helper.test.ts
 */

import { generateMpUrlSlug, validateMpUrlSlug } from './mp-url-helper'

describe('generateMpUrlSlug', () => {
  describe('simple names', () => {
    it('should generate slug for simple name', () => {
      const result = generateMpUrlSlug('John', 'Smith', '12345')
      expect(result).toBe('John-Smith(12345)')
    })

    it('should handle names with spaces', () => {
      const result = generateMpUrlSlug('Mary Jane', 'Watson', '67890')
      expect(result).toBe('Mary-Jane-Watson(67890)')
    })
  })

  describe('names with hyphens', () => {
    it('should preserve existing hyphens in first name', () => {
      const result = generateMpUrlSlug('Jean-Yves', 'Blanchet', '11111')
      expect(result).toBe('Jean-Yves-Blanchet(11111)')
    })

    it('should preserve existing hyphens in last name', () => {
      const result = generateMpUrlSlug('Xavier', 'Barsalou-Duval', '22222')
      expect(result).toBe('Xavier-Barsalou-Duval(22222)')
    })

    it('should handle hyphens in both names', () => {
      const result = generateMpUrlSlug('Jean-Yves', 'Blanchet-Fillion', '33333')
      expect(result).toBe('Jean-Yves-Blanchet-Fillion(33333)')
    })
  })

  describe('names with accents', () => {
    it('should handle accented characters', () => {
      const result = generateMpUrlSlug('Josée', 'Lavoie', '44444')
      // Should encode accents properly using percent encoding
      expect(result).toContain('(44444)')
      expect(result).toContain('%') // Should contain percent encoding
      expect(validateMpUrlSlug(result)).toBe(true)
    })

    it('should handle French accented names', () => {
      const result = generateMpUrlSlug('François', 'Legault', '55555')
      expect(result).toContain('(55555)')
      expect(result).toContain('%') // Should contain percent encoding
      expect(validateMpUrlSlug(result)).toBe(true)
    })

    it('should handle multiple accented characters', () => {
      const result = generateMpUrlSlug('Josée', 'Lévesque', '66666')
      expect(result).toContain('(66666)')
      expect(validateMpUrlSlug(result)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should trim whitespace', () => {
      const result = generateMpUrlSlug('  John  ', '  Smith  ', '12345')
      expect(result).toBe('John-Smith(12345)')
    })

    it('should handle multiple spaces', () => {
      const result = generateMpUrlSlug('Mary   Jane', 'Watson   Smith', '67890')
      expect(result).toBe('Mary-Jane-Watson-Smith(67890)')
    })

    it('should not create double hyphens', () => {
      const result = generateMpUrlSlug('Jean--Yves', 'Blanchet', '11111')
      // Should normalize double hyphens
      expect(result).not.toContain('--')
    })

    it('should throw error for missing firstName', () => {
      expect(() => generateMpUrlSlug('', 'Smith', '12345')).toThrow(
        'firstName, lastName, and personId are required'
      )
    })

    it('should throw error for missing lastName', () => {
      expect(() => generateMpUrlSlug('John', '', '12345')).toThrow(
        'firstName, lastName, and personId are required'
      )
    })

    it('should throw error for missing personId', () => {
      expect(() => generateMpUrlSlug('John', 'Smith', '')).toThrow(
        'firstName, lastName, and personId are required'
      )
    })

    it('should throw error for invalid personId format', () => {
      expect(() => generateMpUrlSlug('John', 'Smith', '123-45')).toThrow(
        'Invalid personId format'
      )
    })
  })

  describe('special characters', () => {
    it('should handle apostrophes', () => {
      const result = generateMpUrlSlug("O'Brien", 'Smith', '12345')
      expect(result).toContain('(12345)')
      expect(validateMpUrlSlug(result)).toBe(true)
    })

    it('should handle periods', () => {
      const result = generateMpUrlSlug('J.R.', 'Smith', '12345')
      expect(result).toContain('(12345)')
      expect(validateMpUrlSlug(result)).toBe(true)
    })
  })
})

describe('validateMpUrlSlug', () => {
  it('should validate correct slug format', () => {
    expect(validateMpUrlSlug('John-Smith(12345)')).toBe(true)
    expect(validateMpUrlSlug('Jean-Yves-Blanchet(67890)')).toBe(true)
    expect(validateMpUrlSlug('Xavier-Barsalou-Duval(11111)')).toBe(true)
  })

  it('should validate slugs with percent-encoded accents', () => {
    // Josée -> Jos%C3%A9e
    expect(validateMpUrlSlug('Jos%C3%A9e-Lavoie(44444)')).toBe(true)
    // François -> Fran%C3%A7ois
    expect(validateMpUrlSlug('Fran%C3%A7ois-Legault(55555)')).toBe(true)
  })

  it('should reject invalid percent encoding', () => {
    expect(validateMpUrlSlug('Jos%C-Lavoie(44444)')).toBe(false) // Incomplete encoding
    expect(validateMpUrlSlug('Jos%XX-Lavoie(44444)')).toBe(false) // Invalid hex
    expect(validateMpUrlSlug('Jos%-Lavoie(44444)')).toBe(false) // Missing hex digits
  })

  it('should reject invalid formats', () => {
    expect(validateMpUrlSlug('John Smith(12345)')).toBe(false) // Space instead of hyphen
    expect(validateMpUrlSlug('John-Smith-12345')).toBe(false) // Missing parentheses
    expect(validateMpUrlSlug('John-Smith()')).toBe(false) // Empty personId
    expect(validateMpUrlSlug('John-Smith(123-45)')).toBe(false) // Hyphen in personId
    expect(validateMpUrlSlug('John@Smith(12345)')).toBe(false) // Invalid character
  })

  it('should handle edge cases', () => {
    expect(validateMpUrlSlug('')).toBe(false)
    expect(validateMpUrlSlug('John')).toBe(false)
    expect(validateMpUrlSlug('(12345)')).toBe(false)
  })
})

