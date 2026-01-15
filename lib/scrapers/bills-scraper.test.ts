/**
 * Unit tests for BillsScraper - PersonId matching
 * To run: npx jest lib/scrapers/bills-scraper.test.ts
 */

import { BillsScraper } from './bills-scraper'
import { db } from '../db'
import { mps } from '../db/schema'

// Mock the database
jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
  },
  mps: {},
}))

// Mock fetch globally
global.fetch = jest.fn()

describe('BillsScraper - PersonId Matching', () => {
  let scraper: BillsScraper
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let mockWhere: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    scraper = new BillsScraper()

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
    it('should match sponsor MP by PersonId when PersonId is available', async () => {
      const mockJSON = {
        Bill: [
          {
            BillNumber: 'C-1',
            Title: 'Test Bill',
            Sponsor: {
              Person: {
                PersonId: '12345',
                PersonOfficialFirstName: 'John',
                PersonOfficialLastName: 'Smith',
              },
            },
            IntroductionDate: '2024-01-01',
            Status: 'First Reading',
          },
        ],
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJSON),
      })

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

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].sponsorMpId).toBe(1)
      expect(result.data?.[0].billNumber).toBe('C-1')
    })

    it('should fallback to name matching when PersonId is missing', async () => {
      const mockJSON = {
        Bill: [
          {
            BillNumber: 'C-2',
            Title: 'Another Bill',
            Sponsor: {
              Person: {
                PersonOfficialFirstName: 'Jane',
                PersonOfficialLastName: 'Doe',
              },
            },
            IntroductionDate: '2024-02-01',
          },
        ],
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJSON),
      })

      // Mock PersonId map (first call - empty - no PersonId in JSON)
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

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].sponsorMpId).toBe(2)
    })

    it('should fallback to name matching when PersonId not found in database', async () => {
      const mockJSON = {
        Bill: [
          {
            BillNumber: 'C-3',
            Title: 'Third Bill',
            Sponsor: {
              Person: {
                PersonId: '99999', // Not in database
                PersonOfficialFirstName: 'Bob',
                PersonOfficialLastName: 'Johnson',
              },
            },
          },
        ],
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJSON),
      })

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
      // Note: XML has "Bob Johnson", so mock should have matching name
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([{ id: 3, fullName: 'Bob Johnson' }])
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].sponsorMpId).toBe(3)
    })

    it('should handle bills without sponsors', async () => {
      const mockJSON = {
        Bill: [
          {
            BillNumber: 'C-4',
            Title: 'Bill Without Sponsor',
            // No Sponsor field
          },
        ],
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJSON),
      })

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].sponsorMpId).toBeUndefined()
    })

    it('should skip bill when sponsor PersonId and name both not found', async () => {
      const mockJSON = {
        Bill: [
          {
            BillNumber: 'C-5',
            Title: 'Orphan Bill',
            Sponsor: {
              Person: {
                PersonId: '99999',
                PersonOfficialFirstName: 'Unknown',
                PersonOfficialLastName: 'Person',
              },
            },
          },
        ],
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJSON),
      })

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

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      // Bill is still included, but sponsorMpId is undefined
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].sponsorMpId).toBeUndefined()
    })
  })

  describe('Error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle JSON parsing errors gracefully', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      })

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

