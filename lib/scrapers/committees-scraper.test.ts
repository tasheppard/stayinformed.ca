/**
 * Unit tests for CommitteesScraper - PersonId matching
 * To run: npx jest lib/scrapers/committees-scraper.test.ts
 */

import { CommitteesScraper } from './committees-scraper'
import { db } from '../db'
import { mps } from '../db/schema'

// Mock the database
jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
  },
  mps: {},
}))

// Mock Playwright
const mockPage = {
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  evaluate: jest.fn(),
  close: jest.fn(),
}

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn(),
}

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}))

describe('CommitteesScraper - PersonId Matching', () => {
  let scraper: CommitteesScraper
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let mockWhere: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    scraper = new CommitteesScraper()

    // Setup database mock chain for select queries
    // Note: getMPPersonIdMap uses db.select().from().where() - returns Promise
    //       getMPNameMap uses db.select().from() - also returns Promise (no where clause)
    mockWhere = jest.fn().mockImplementation(() => {
      return Promise.resolve([])
    })
    
    // Default result for queries without where() (used by getMPNameMap)
    const mockFromResult: any[] = []
    
    // mockFrom can return either { where: ... } for queries with where(), or Promise directly for queries without where()
    mockFrom = jest.fn().mockImplementation((table) => {
      // Return an object with where() method, but also make it directly awaitable
      const queryResult = Promise.resolve(mockFromResult)
      const queryBuilder = {
        where: mockWhere,
        // Make the queryBuilder itself awaitable (for queries without where())
        then: queryResult.then.bind(queryResult),
        catch: queryResult.catch.bind(queryResult),
        finally: queryResult.finally.bind(queryResult),
      }
      return queryBuilder
    })
    mockSelect = jest.fn().mockReturnValue({
      from: mockFrom,
    })
    ;(db.select as jest.Mock) = mockSelect
  })

  describe('PersonId matching', () => {
    it('should match MP by PersonId when PersonId is extracted from HTML', async () => {
      // Mock HTML evaluation to return data with PersonId
      mockPage.evaluate.mockResolvedValue([
        {
          mpId: 0,
          committeeName: 'Finance Committee',
          role: 'Member',
          mpName: 'John Smith',
          personId: '12345', // Extracted from HTML link
        },
      ])

      // Mock PersonId map (first call to getMPPersonIdMap - uses db.select().from().where())
      mockWhere.mockImplementationOnce(() => Promise.resolve([
        { id: 1, personId: '12345' },
      ]))

      // Mock name map (second call to getMPNameMap - should not be used)
      // getMPNameMap uses db.select().from() - no where(), so it awaits mockFrom() directly
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([{ id: 1, fullName: 'John Smith' }])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      const result = await scraper['scrapeWithPlaywright']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].mpId).toBe(1)
      expect(result.data?.[0].committeeName).toBe('Finance Committee')
    })

    it('should fallback to name matching when PersonId is missing from HTML', async () => {
      // Mock HTML evaluation to return data without PersonId
      mockPage.evaluate.mockResolvedValue([
        {
          mpId: 0,
          committeeName: 'Health Committee',
          role: 'Chair',
          mpName: 'Jane Doe',
          // No personId
        },
      ])

      // Mock PersonId map (first call - empty - no PersonId in HTML)
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))
      
      // First call to mockFrom: getMPPersonIdMap - return query builder with where()
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      // Second call to mockFrom: getMPNameMap - return awaitable with name data
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([{ id: 2, fullName: 'Jane Doe' }])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      const result = await scraper['scrapeWithPlaywright']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].mpId).toBe(2)
    })

    it('should fallback to name matching when PersonId not found in database', async () => {
      // Mock HTML evaluation to return data with PersonId
      mockPage.evaluate.mockResolvedValue([
        {
          mpId: 0,
          committeeName: 'Transport Committee',
          role: 'Vice-Chair',
          mpName: 'Bob Johnson',
          personId: '99999', // Not in database
        },
      ])

      // Mock PersonId map (PersonId not found)
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))
      
      // First call to mockFrom: getMPPersonIdMap - return query builder with where()
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      // Second call to mockFrom: getMPNameMap - return awaitable with name data
      // Note: HTML has "Bob Johnson", so mock should have matching name
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([{ id: 3, fullName: 'Bob Johnson' }])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      const result = await scraper['scrapeWithPlaywright']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].mpId).toBe(3)
    })

    it('should skip committee participation when neither PersonId nor name match', async () => {
      // Mock HTML evaluation to return data
      mockPage.evaluate.mockResolvedValue([
        {
          mpId: 0,
          committeeName: 'Unknown Committee',
          mpName: 'Unknown Person',
          personId: '99999',
        },
      ])

      // Mock PersonId map (PersonId not found)
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))
      
      // First call to mockFrom: getMPPersonIdMap - return query builder with where()
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      // Second call to mockFrom: getMPNameMap - return awaitable with empty result
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      const result = await scraper['scrapeWithPlaywright']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(0) // Participation skipped
    })

    it('should handle missing mpName and personId', async () => {
      // Mock HTML evaluation to return data without name or PersonId
      mockPage.evaluate.mockResolvedValue([
        {
          mpId: 0,
          committeeName: 'Some Committee',
          // No mpName, no personId
        },
      ])

      // Mock PersonId map
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))
      
      // First call to mockFrom: getMPPersonIdMap - return query builder with where()
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      // Second call to mockFrom: getMPNameMap - return awaitable with empty result
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      const result = await scraper['scrapeWithPlaywright']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(0) // Participation skipped
    })
  })

  describe('Error handling', () => {
    it('should handle Playwright errors gracefully', async () => {
      mockBrowser.newPage.mockRejectedValue(new Error('Browser error'))

      const result = await scraper['scrapeWithPlaywright']()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle page navigation errors gracefully', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation error'))

      const result = await scraper['scrapeWithPlaywright']()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle database query errors gracefully', async () => {
      mockPage.evaluate.mockResolvedValue([
        {
          mpId: 0,
          committeeName: 'Test Committee',
          mpName: 'Test Person',
          personId: '12345',
        },
      ])

      // Mock database error
      mockWhere.mockRejectedValueOnce(new Error('Database error'))

      const result = await scraper['scrapeWithPlaywright']()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

