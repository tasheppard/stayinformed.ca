/**
 * Unit tests for VotesScraper - PersonId matching
 * To run: npx jest lib/scrapers/votes-scraper.test.ts
 */

import { VotesScraper } from './votes-scraper'
import { db } from '../db'
import { mps } from '../db/schema'

// Mock the database
jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    execute: jest.fn(),
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

describe('VotesScraper - PersonId Matching', () => {
  let scraper: VotesScraper
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let mockWhere: jest.Mock
  let mockFromResult: any[] // Default result for queries without where()

  beforeEach(() => {
    jest.clearAllMocks()
    scraper = new VotesScraper()

    // Setup database mock chain for select queries
    // Note: getMPPersonIdMap uses db.select().from().where() - returns Promise
    //       getMPNameMap uses db.select().from() - also returns Promise (no where clause)
    // Both need to return Promises that resolve to arrays
    mockWhere = jest.fn().mockImplementation(() => {
      return Promise.resolve([])
    })
    
    // Default result for queries without where() (used by getMPNameMap)
    mockFromResult = []
    
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
    
    // Reset mockParseXML
    mockParseXML.mockReturnValue({})
  })

  describe('PersonId matching', () => {
    it('should match MP by PersonId when PersonId is available', async () => {
      const mockXML = {
        Votes: {
          Vote: [
            {
              VoteNumber: [{ _: '1' }],
              Session: [{ _: '44-1' }],
              VoteDate: [{ _: '2024-01-01' }],
              MemberVotes: [
                {
                  Member: [
                    {
                      MemberOfParliament: [
                        {
                          PersonId: [{ _: '12345' }],
                          PersonOfficialFirstName: [{ _: 'John' }],
                          PersonOfficialLastName: [{ _: 'Smith' }],
                        },
                      ],
                      Vote: [{ _: 'Yea' }],
                    },
                  ],
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

      // Reset mockWhere to clear any previous calls
      mockWhere.mockClear()
      
      // Mock PersonId map (first call to getMPPersonIdMap - uses db.select().from().where())
      // Note: getMPPersonIdMap is called first, then getMPNameMap is called
      const personIdData = [{ id: 1, personId: '12345' }]
      const nameData = [{ id: 1, fullName: 'John Smith' }]
      
      mockWhere
        .mockImplementationOnce(() => {
          return Promise.resolve(personIdData)
        })
        .mockImplementationOnce(() => {
          return Promise.resolve(nameData)
        })

      const result = await scraper['scrapeXML']()

      if (!result.success) {
        console.log('Test failed with error:', result.error)
        console.log('mockWhere was called', mockWhere.mock.calls.length, 'times')
        if (mockWhere.mock.calls.length > 0) {
          const firstCallResult = mockWhere.mock.results[0]?.value
          console.log('First call result:', firstCallResult)
          if (firstCallResult && typeof firstCallResult.then === 'function') {
            try {
              const resolved = await firstCallResult
              console.log('Resolved value:', resolved, 'Type:', typeof resolved, 'Is array:', Array.isArray(resolved))
            } catch (e) {
              console.log('Error resolving:', e)
            }
          }
        }
      }
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].mpId).toBe(1)
      expect(result.data?.[0].voteResult).toBe('Yea')
    })

    it('should fallback to name matching when PersonId is missing', async () => {
      const mockXML = {
        Votes: {
          Vote: [
            {
              VoteNumber: [{ _: '1' }],
              Session: [{ _: '44-1' }],
              VoteDate: [{ _: '2024-01-01' }],
              MemberVotes: [
                {
                  Member: [
                    {
                      MemberOfParliament: [
                        {
                          PersonOfficialFirstName: [{ _: 'John' }],
                          PersonOfficialLastName: [{ _: 'Smith' }],
                        },
                      ],
                      Vote: [{ _: 'Nay' }],
                    },
                  ],
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

      // Mock PersonId map (first call - empty - no PersonId in XML)
      // getMPPersonIdMap uses db.select().from().where()
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))

      // Mock name map (second call - should be used)
      // getMPNameMap uses db.select().from() - no where(), so it awaits mockFrom() directly
      // We need to override the default mockFromResult for this test
      const originalFromResult = mockFromResult
      mockFromResult = [{ id: 2, fullName: 'John Smith' }]
      
      // Also need to update mockFrom to return the new result
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve(mockFromResult)
        return {
          where: mockWhere,
          then: queryResult.then.bind(queryResult),
          catch: queryResult.catch.bind(queryResult),
          finally: queryResult.finally.bind(queryResult),
        }
      })
      
      // Restore after test
      const restoreFromResult = () => { mockFromResult = originalFromResult }

      const result = await scraper['scrapeXML']()
      
      // Restore default
      restoreFromResult()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(1)
      expect(result.data?.[0].mpId).toBe(2)
      expect(result.data?.[0].voteResult).toBe('Nay')
    })

    it('should fallback to name matching when PersonId not found in database', async () => {
      const mockXML = {
        Votes: {
          Vote: [
            {
              VoteNumber: [{ _: '1' }],
              Session: [{ _: '44-1' }],
              VoteDate: [{ _: '2024-01-01' }],
              MemberVotes: [
                {
                  Member: [
                    {
                      MemberOfParliament: [
                        {
                          PersonId: [{ _: '99999' }], // Not in database
                          PersonOfficialFirstName: [{ _: 'John' }],
                          PersonOfficialLastName: [{ _: 'Smith' }],
                        },
                      ],
                      Vote: [{ _: 'Paired' }],
                    },
                  ],
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
      // getMPPersonIdMap uses db.select().from().where()
      // First call to mockFrom() is for getMPPersonIdMap - returns query builder with where()
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
      // Note: XML has "John Smith", so mock should have matching name
      mockFrom.mockImplementationOnce((table) => {
        const queryResult = Promise.resolve([{ id: 3, fullName: 'John Smith' }])
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
      expect(result.data?.[0].mpId).toBe(3)
      expect(result.data?.[0].voteResult).toBe('Paired')
    })

    it('should skip vote when neither PersonId nor name match', async () => {
      const mockXML = {
        Votes: {
          Vote: [
            {
              VoteNumber: [{ _: '1' }],
              Session: [{ _: '44-1' }],
              VoteDate: [{ _: '2024-01-01' }],
              MemberVotes: [
                {
                  Member: [
                    {
                      MemberOfParliament: [
                        {
                          PersonId: [{ _: '99999' }],
                          PersonOfficialFirstName: [{ _: 'Unknown' }],
                          PersonOfficialLastName: [{ _: 'Person' }],
                        },
                      ],
                      Vote: [{ _: 'Yea' }],
                    },
                  ],
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

      // Mock PersonId map (first call - PersonId not found)
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))

      // Mock name map (second call - name not found)
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))

      const result = await scraper['scrapeXML']()

      if (!result.success) {
        console.log('Test failed with error:', result.error)
      }
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(0) // Vote skipped
    })

    it('should handle missing name when PersonId is also missing', async () => {
      const mockXML = {
        Votes: {
          Vote: [
            {
              VoteNumber: [{ _: '1' }],
              Session: [{ _: '44-1' }],
              VoteDate: [{ _: '2024-01-01' }],
              MemberVotes: [
                {
                  Member: [
                    {
                      MemberOfParliament: [
                        {
                          // No PersonId, no name
                        },
                      ],
                      Vote: [{ _: 'Yea' }],
                    },
                  ],
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

      // Mock PersonId map (first call)
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))

      // Mock name map (second call)
      mockWhere.mockImplementationOnce(() => Promise.resolve([]))

      const result = await scraper['scrapeXML']()

      if (!result.success) {
        console.log('Test failed with error:', result.error)
      }
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBe(0) // Vote skipped
    })
  })

  describe('Error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Network error')
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

    it('should handle database query errors gracefully', async () => {
      const mockXML = {
        Votes: {
          Vote: [
            {
              VoteNumber: [{ _: '1' }],
              Session: [{ _: '44-1' }],
              VoteDate: [{ _: '2024-01-01' }],
              MemberVotes: [
                {
                  Member: [
                    {
                      MemberOfParliament: [
                        {
                          PersonId: [{ _: '12345' }],
                          PersonOfficialFirstName: [{ _: 'John' }],
                          PersonOfficialLastName: [{ _: 'Smith' }],
                        },
                      ],
                      Vote: [{ _: 'Yea' }],
                    },
                  ],
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

      // Mock database error (PersonId map uses db.select().from().where())
      mockWhere.mockRejectedValueOnce(new Error('Database error'))

      const result = await scraper['scrapeXML']()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

