/**
 * Unit tests for MPListScraper
 * To run: npx jest lib/scrapers/mp-list-scraper.test.ts
 */

import { MPListScraper } from './mp-list-scraper'
import { db } from '../db'
import { mps } from '../db/schema'
import { eq, inArray } from 'drizzle-orm'

// Mock the database
jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
  mps: {},
}))

// Mock xml2js
jest.mock('xml2js', () => ({
  parseString: jest.fn((xml, options, callback) => {
    // Simulate async behavior
    process.nextTick(() => {
      callback(null, {})
    })
  }),
}))

// Mock fetch globally
global.fetch = jest.fn()

// Mock Playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        goto: jest.fn(),
        waitForSelector: jest.fn(),
        content: jest.fn().mockResolvedValue('<html><body>XML content</body></html>'),
        evaluate: jest.fn().mockResolvedValue('<xml>content</xml>'),
        close: jest.fn(),
      }),
      close: jest.fn(),
    }),
  },
}))

describe('MPListScraper', () => {
  let scraper: MPListScraper
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let mockWhere: jest.Mock
  let mockLimit: jest.Mock
  let mockInsert: jest.Mock
  let mockUpdate: jest.Mock
  let mockSet: jest.Mock
  let mockValues: jest.Mock

  // Helper to create a thenable object that can be awaited AND has a limit method
  // This supports both query patterns:
  // 1. Queries with .limit(): db.select().from().where().limit() -> returns Promise
  // 2. Queries without .limit(): db.select().from().where() -> returns Promise directly
  const createThenableWithLimit = (defaultValue: any[] = [], limitMock?: jest.Mock) => {
    const limit = limitMock || mockLimit
    const thenable = {
      then: (onFulfilled?: (value: any[]) => any) => {
        return Promise.resolve(defaultValue).then(onFulfilled)
      },
      catch: (onRejected?: (reason: any) => any) => {
        return Promise.resolve(defaultValue).catch(onRejected)
      },
      finally: (onFinally?: () => void) => {
        return Promise.resolve(defaultValue).finally(onFinally)
      },
      limit: limit,
    }
    return thenable
  }

  beforeEach(() => {
    jest.clearAllMocks()
    scraper = new MPListScraper()

    // Setup database mock chain for select queries
    mockLimit = jest.fn().mockResolvedValue([])
    
    // mockWhere returns a thenable that resolves to [] by default
    // Tests can override this by setting mockWhere.mockReturnValueOnce()
    mockWhere = jest.fn().mockReturnValue(createThenableWithLimit([]))
    
    mockFrom = jest.fn().mockReturnValue({
      where: mockWhere,
    })
    mockSelect = jest.fn().mockReturnValue({
      from: mockFrom,
    })

    // Setup database mock chain for insert
    mockValues = jest.fn().mockResolvedValue(undefined)
    mockInsert = jest.fn().mockReturnValue({
      values: mockValues,
    })

    // Setup database mock chain for update
    const mockUpdateWhere = jest.fn().mockResolvedValue(undefined)
    mockSet = jest.fn().mockReturnValue({
      where: mockUpdateWhere,
    })
    mockUpdate = jest.fn().mockReturnValue({
      set: mockSet,
    })

    ;(db.select as jest.Mock) = mockSelect
    ;(db.insert as jest.Mock) = mockInsert
    ;(db.update as jest.Mock) = mockUpdate
  })

  describe('XML parsing', () => {
    it('should parse valid XML response', async () => {
      const mockXML = `<?xml version="1.0" encoding="UTF-8"?>
<ArrayOfMemberOfParliament>
  <MemberOfParliament>
    <PersonId>12345</PersonId>
    <PersonOfficialFirstName>John</PersonOfficialFirstName>
    <PersonOfficialLastName>Smith</PersonOfficialLastName>
    <ConstituencyName>Toronto Centre</ConstituencyName>
    <ConstituencyProvinceTerritoryName>Ontario</ConstituencyProvinceTerritoryName>
    <CaucusShortName>Liberal</CaucusShortName>
    <FromDateTime>2024-01-01T00:00:00</FromDateTime>
    <ToDateTime></ToDateTime>
  </MemberOfParliament>
</ArrayOfMemberOfParliament>`

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml, options, callback) => {
        const result = {
          ArrayOfMemberOfParliament: {
            MemberOfParliament: [
              {
                PersonId: ['12345'],
                PersonOfficialFirstName: ['John'],
                PersonOfficialLastName: ['Smith'],
                ConstituencyName: ['Toronto Centre'],
                ConstituencyProvinceTerritoryName: ['Ontario'],
                CaucusShortName: ['Liberal'],
                FromDateTime: ['2024-01-01T00:00:00'],
                ToDateTime: [],
              },
            ],
          },
        }
        process.nextTick(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => mockXML,
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0]).toMatchObject({
        personId: '12345',
        firstName: 'John',
        lastName: 'Smith',
        fullName: 'John Smith',
        constituencyName: 'Toronto Centre',
        province: 'Ontario',
        caucusShortName: 'Liberal',
      })
    })

    it('should handle XML with attributes', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml, options, callback) => {
        const result = {
          ArrayOfMemberOfParliament: {
            MemberOfParliament: [
              {
                PersonId: [{ _: '12345' }], // With attributes, text in '_'
                PersonOfficialFirstName: [{ _: 'John' }],
                PersonOfficialLastName: [{ _: 'Smith' }],
                ConstituencyName: [{ _: 'Toronto Centre' }],
                ConstituencyProvinceTerritoryName: [{ _: 'Ontario' }],
                CaucusShortName: [{ _: 'Liberal' }],
                FromDateTime: [],
                ToDateTime: [],
              },
            ],
          },
        }
        process.nextTick(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<xml>test</xml>',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      expect(result.data?.[0].personId).toBe('12345')
    })

    it('should skip MPs with missing required fields', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml, options, callback) => {
        const result = {
          ArrayOfMemberOfParliament: {
            MemberOfParliament: [
              {
                PersonId: ['12345'],
                PersonOfficialFirstName: ['John'],
                PersonOfficialLastName: ['Smith'],
                ConstituencyName: ['Toronto Centre'],
                ConstituencyProvinceTerritoryName: ['Ontario'],
              },
              {
                // Missing PersonId
                PersonOfficialFirstName: ['Jane'],
                PersonOfficialLastName: ['Doe'],
                ConstituencyName: ['Ottawa Centre'],
                ConstituencyProvinceTerritoryName: ['Ontario'],
              },
            ],
          },
        }
        process.nextTick(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<xml>test</xml>',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      expect(result.data?.length).toBe(1) // Only valid MP included
      expect(result.data?.[0].personId).toBe('12345')
    })

    it('should handle invalid dates gracefully', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml, options, callback) => {
        const result = {
          ArrayOfMemberOfParliament: {
            MemberOfParliament: [
              {
                PersonId: ['12345'],
                PersonOfficialFirstName: ['John'],
                PersonOfficialLastName: ['Smith'],
                ConstituencyName: ['Toronto Centre'],
                ConstituencyProvinceTerritoryName: ['Ontario'],
                FromDateTime: ['invalid-date'],
                ToDateTime: ['also-invalid'],
              },
            ],
          },
        }
        process.nextTick(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<xml>test</xml>',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      expect(result.data?.[0].fromDateTime).toBeUndefined()
      expect(result.data?.[0].toDateTime).toBeUndefined()
    })

    it('should handle HTTP errors', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(false)
      expect(result.error).toContain('HTTP 500')
    })

    it('should handle XML parsing errors', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml, options, callback) => {
        process.nextTick(() => callback(new Error('Parse error'), null))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<invalid>xml',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle empty XML response', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml, options, callback) => {
        const result = {}
        process.nextTick(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<xml></xml>',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(false)
      expect(result.error).toContain('No MPs found')
    })

    it('should support dry run mode', async () => {
      const originalEnv = process.env.MP_SCRAPER_DRY_RUN
      process.env.MP_SCRAPER_DRY_RUN = 'true'

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml, options, callback) => {
        const result = {
          ArrayOfMemberOfParliament: {
            MemberOfParliament: Array.from({ length: 10 }, (_, i) => ({
              PersonId: [`${i}`],
              PersonOfficialFirstName: [`First${i}`],
              PersonOfficialLastName: [`Last${i}`],
              ConstituencyName: [`Constituency${i}`],
              ConstituencyProvinceTerritoryName: ['Ontario'],
            })),
          },
        }
        process.nextTick(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<xml>test</xml>',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      expect(result.data?.length).toBe(5) // Only first 5 in dry run

      // Properly restore environment variable: delete if originally undefined, otherwise restore value
      if (originalEnv === undefined) {
        delete process.env.MP_SCRAPER_DRY_RUN
      } else {
        process.env.MP_SCRAPER_DRY_RUN = originalEnv
      }
    })
  })

  describe('Database upserts', () => {
    it('should insert new MP when personId does not exist', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
          caucusShortName: 'Liberal',
        },
      ]

      // Mock: no existing MP found
      mockLimit.mockResolvedValueOnce([])

      await (scraper as any).saveToDatabase(mpData)

      expect(db.insert).toHaveBeenCalledWith(mps)
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          personId: '12345',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
          isActive: true,
          status: 'active',
        })
      )
    })

    it('should update existing MP when personId exists', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
          caucusShortName: 'Liberal',
        },
      ]

      // Mock: existing MP found
      const existingMP = {
        id: 1,
        personId: '12345',
        fullName: 'John Smith',
        constituencyName: 'Toronto Centre',
        province: 'Ontario',
        caucusShortName: 'Liberal',
      }
      mockLimit.mockResolvedValueOnce([existingMP])

      await (scraper as any).saveToDatabase(mpData)

      expect(db.update).toHaveBeenCalledWith(mps)
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          personId: '12345',
          isActive: true,
          status: 'active',
        })
      )
    })

    it('should handle multiple MPs', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
        },
        {
          personId: '67890',
          firstName: 'Jane',
          lastName: 'Doe',
          fullName: 'Jane Doe',
          constituencyName: 'Ottawa Centre',
          province: 'Ontario',
        },
      ]

      // Mock: first MP exists, second doesn't
      mockLimit
        .mockResolvedValueOnce([
          { id: 1, personId: '12345', fullName: 'John Smith' },
        ])
        .mockResolvedValueOnce([])

      await (scraper as any).saveToDatabase(mpData)

      expect(db.update).toHaveBeenCalled() // For existing MP
      expect(db.insert).toHaveBeenCalled() // For new MP
    })
  })

  describe('Soft delete logic', () => {
    it('should mark MPs as inactive when not in XML list', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
        },
      ]

      // Mock: no existing MP found (will insert)
      mockLimit.mockResolvedValueOnce([])

      // Mock: active MPs query returns MPs not in XML
      // First call is for checking existing MP (uses .limit()), second is for active MPs query (no .limit())
      const departedMPs = [
        { id: 2, personId: '99999' }, // Not in XML
        { id: 3, personId: '88888' }, // Not in XML
      ]

      mockSelect
        .mockReturnValueOnce({
          // First call: check if MP exists (uses .limit())
          from: mockFrom,
        })
        .mockReturnValueOnce({
          // Second call: get active MPs (no .limit())
          from: mockFrom,
        })

      // First where() call is for checking existing MP (uses .limit())
      // Second where() call is for soft delete query (no .limit())
      mockWhere
        .mockReturnValueOnce(createThenableWithLimit([])) // First call: no existing MP
        .mockReturnValueOnce(createThenableWithLimit(departedMPs)) // Second call: active MPs query

      await (scraper as any).saveToDatabase(mpData)

      // Should call update to mark as inactive
      expect(db.update).toHaveBeenCalled()
      // Verify it was called with inArray for the departed MPs
      const updateCalls = (db.update as jest.Mock).mock.calls
      expect(updateCalls.length).toBeGreaterThan(0)
      
      // Verify the update was called with the correct data (isActive: false, status: 'past')
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          status: 'past',
        })
      )
    })

    it('should not mark any MPs inactive when all are in XML', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
        },
      ]

      // Mock: no existing MP found (will insert)
      mockLimit.mockResolvedValueOnce([])

      // Mock: active MPs query returns only MP in XML
      const activeMPs = [
        { id: 1, personId: '12345' }, // In XML
      ]

      mockSelect
        .mockReturnValueOnce({
          // First call: check if MP exists (uses .limit())
          from: mockFrom,
        })
        .mockReturnValueOnce({
          // Second call: get active MPs (no .limit())
          from: mockFrom,
        })

      // First where() call is for checking existing MP (uses .limit())
      // Second where() call is for soft delete query (no .limit())
      mockWhere
        .mockReturnValueOnce(createThenableWithLimit([])) // First call: no existing MP
        .mockReturnValueOnce(createThenableWithLimit(activeMPs)) // Second call: active MPs query

      await (scraper as any).saveToDatabase(mpData)

      // Should have called insert for the new MP
      expect(db.insert).toHaveBeenCalled()
      
      // Should NOT have called update for soft delete (no departed MPs)
      // The only update call would be for the MP itself, but since we're inserting, there's no update
      const updateCalls = (db.update as jest.Mock).mock.calls
      // If update was called, it should only be for the MP itself, not for soft delete
      // Since we're inserting, update shouldn't be called at all
      expect(updateCalls.length).toBe(0)
    })
  })

  describe('Data validation', () => {
    it('should validate data with all required fields', () => {
      const validData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
        },
      ]

      const result = (scraper as any).validateData(validData)

      expect(result.isValid).toBe(true)
      expect(result.anomalies).toHaveLength(0)
    })

    it('should flag missing required fields', () => {
      const invalidData = [
        {
          personId: '',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
        },
        {
          personId: '12345',
          firstName: '',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
        },
      ]

      const result = (scraper as any).validateData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.anomalies.some((a: string) => a.includes('missing required fields'))).toBe(
        true
      )
    })

    it('should flag duplicate PersonIds', () => {
      const duplicateData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
        },
        {
          personId: '12345', // Duplicate
          firstName: 'Jane',
          lastName: 'Doe',
          fullName: 'Jane Doe',
          constituencyName: 'Ottawa Centre',
          province: 'Ontario',
        },
      ]

      const result = (scraper as any).validateData(duplicateData)

      expect(result.isValid).toBe(false)
      expect(result.anomalies.some((a: string) => a.includes('duplicate PersonIds'))).toBe(true)
    })

    it('should flag invalid dates', () => {
      const invalidDateData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
          fromDateTime: new Date('invalid'),
          toDateTime: new Date('invalid'),
        },
      ]

      const result = (scraper as any).validateData(invalidDateData)

      expect(result.isValid).toBe(false)
      expect(result.anomalies.some((a: string) => a.includes('invalid dates'))).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
        },
      ]

      mockLimit.mockRejectedValueOnce(new Error('Database connection failed'))

      // Should not throw, but log error
      await expect((scraper as any).saveToDatabase(mpData)).resolves.not.toThrow()
    })

    it('should handle network timeouts', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Request timeout')
      )

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('getSourceUrl', () => {
    it('should return the correct XML endpoint URL', () => {
      const url = (scraper as any).getSourceUrl()
      expect(url).toBe('https://www.ourcommons.ca/Members/en/search/XML')
    })
  })

  describe('Full workflow', () => {
    it('should run complete scrape workflow', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml, options, callback) => {
        const result = {
          ArrayOfMemberOfParliament: {
            MemberOfParliament: [
              {
                PersonId: ['12345'],
                PersonOfficialFirstName: ['John'],
                PersonOfficialLastName: ['Smith'],
                ConstituencyName: ['Toronto Centre'],
                ConstituencyProvinceTerritoryName: ['Ontario'],
                CaucusShortName: ['Liberal'],
              },
            ],
          },
        }
        process.nextTick(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<xml>test</xml>',
      })

      mockLimit.mockResolvedValueOnce([]) // No existing MP

      // Mock active MPs query (no .limit())

      mockSelect
        .mockReturnValueOnce({
          // First call: check if MP exists (uses .limit())
          from: mockFrom,
        })
        .mockReturnValueOnce({
          // Second call: get active MPs (no .limit())
          from: mockFrom,
        })

      // First where() call is for checking existing MP (uses .limit())
      // Second where() call is for soft delete query (no .limit())
      mockWhere
        .mockReturnValueOnce(createThenableWithLimit([])) // First call: no existing MP
        .mockReturnValueOnce(createThenableWithLimit([])) // Second call: no active MPs (empty result)

      const result = await scraper.run()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.sourceUrl).toBe('https://www.ourcommons.ca/Members/en/search/XML')
    })
  })
})

