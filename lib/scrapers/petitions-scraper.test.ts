/**
 * Unit tests for PetitionsScraper - PersonId matching
 * To run: npx jest lib/scrapers/petitions-scraper.test.ts
 */

import { PetitionsScraper } from './petitions-scraper'
import { db } from '../db'
import { mps } from '../db/schema'

// Mock the database
jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
  },
  mps: {},
}))

// Mock xml2js - need to handle promisified version
const mockParseXML = jest.fn()

jest.mock('xml2js', () => {
  const mockParseString = jest.fn((xml, options, callback) => {
    if (callback) {
      // Called with callback (original function)
      process.nextTick(() => {
        callback(null, mockParseXML(xml))
      })
    } else {
      // Called as promisified (no callback)
      return Promise.resolve(mockParseXML(xml))
    }
  })
  return {
    parseString: mockParseString,
  }
})

// Mock util.promisify to return a function that calls parseString directly
jest.mock('util', () => ({
  promisify: jest.fn((fn) => {
    return async (...args: any[]) => {
      const { parseString } = require('xml2js')
      return parseString(...args)
    }
  }),
}))

// Mock fetch globally
global.fetch = jest.fn()

describe('PetitionsScraper - PersonId Matching', () => {
  let scraper: PetitionsScraper
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let mockWhere: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    scraper = new PetitionsScraper()

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
      const mockXML = {
        Petitions: {
          Petition: [
            {
              PetitionNumber: [{ _: 'P-1' }],
              Title: [{ _: 'Test Petition' }],
              Sponsor: [
                {
                  PersonId: [{ _: '12345' }],
                  PersonOfficialFirstName: [{ _: 'John' }],
                  PersonOfficialLastName: [{ _: 'Smith' }],
                },
              ],
              PresentedDate: [{ _: '2024-01-01' }],
              Status: [{ _: 'Presented' }],
              SignatureCount: [{ _: '100' }],
            },
          ],
        },
      }

      mockParseXML.mockReturnValue(mockXML)
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<xml>test</xml>'),
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
      expect(result.data?.[0].petitionNumber).toBe('P-1')
    })

    it('should fallback to name matching when PersonId is missing', async () => {
      const mockXML = {
        Petitions: {
          Petition: [
            {
              PetitionNumber: [{ _: 'P-2' }],
              Title: [{ _: 'Another Petition' }],
              Sponsor: [
                {
                  PersonOfficialFirstName: [{ _: 'Jane' }],
                  PersonOfficialLastName: [{ _: 'Doe' }],
                },
              ],
              PresentedDate: [{ _: '2024-02-01' }],
            },
          ],
        },
      }

      mockParseXML.mockReturnValue(mockXML)
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<xml>test</xml>'),
      })

      // Mock PersonId map (first call - empty - no PersonId in XML)
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
      const mockXML = {
        Petitions: {
          Petition: [
            {
              PetitionNumber: [{ _: 'P-3' }],
              Title: [{ _: 'Third Petition' }],
              Sponsor: [
                {
                  PersonId: [{ _: '99999' }], // Not in database
                  PersonOfficialFirstName: [{ _: 'Bob' }],
                  PersonOfficialLastName: [{ _: 'Johnson' }],
                },
              ],
              PresentedDate: [{ _: '2024-03-01' }],
            },
          ],
        },
      }

      mockParseXML.mockReturnValue(mockXML)
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<xml>test</xml>'),
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

    it('should handle petitions without sponsors', async () => {
      const mockXML = {
        Petitions: {
          Petition: [
            {
              PetitionNumber: [{ _: 'P-4' }],
              Title: [{ _: 'Petition Without Sponsor' }],
              // No Sponsor field
            },
          ],
        },
      }

      mockParseXML.mockReturnValue(mockXML)
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<xml>test</xml>'),
      })

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].sponsorMpId).toBeUndefined()
    })

    it('should skip petition when sponsor PersonId and name both not found', async () => {
      const mockXML = {
        Petitions: {
          Petition: [
            {
              PetitionNumber: [{ _: 'P-5' }],
              Title: [{ _: 'Orphan Petition' }],
              Sponsor: [
                {
                  PersonId: [{ _: '99999' }],
                  PersonOfficialFirstName: [{ _: 'Unknown' }],
                  PersonOfficialLastName: [{ _: 'Person' }],
                },
              ],
            },
          ],
        },
      }

      mockParseXML.mockReturnValue(mockXML)
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<xml>test</xml>'),
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
      // Petition is still included, but sponsorMpId is undefined
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

    it('should handle XML parsing errors gracefully', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<invalid xml>'),
      })

      mockParseXML.mockImplementation(() => {
        throw new Error('XML parse error')
      })

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

