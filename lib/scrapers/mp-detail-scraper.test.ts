/**
 * Unit tests for MPDetailScraper
 * To run: npx jest lib/scrapers/mp-detail-scraper.test.ts
 */

import { MPDetailScraper } from './mp-detail-scraper'
import { db } from '../db'
import { mps, committeeParticipation } from '../db/schema'
import { eq, and } from 'drizzle-orm'

// Mock the database
jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
  mps: {},
  committeeParticipation: {},
}))

// Mock xml2js
jest.mock('xml2js', () => ({
  parseString: jest.fn((xml, options, callback) => {
    setImmediate(() => {
      callback(null, {})
    })
  }),
}))

// Mock photo storage
jest.mock('../storage/photo-storage', () => ({
  processAndUploadPhoto: jest.fn().mockResolvedValue({
    success: true,
    skipped: false,
    photoUrl: undefined, // No photo URL means it was skipped
    photoLastModified: new Date('2024-01-01'),
    reason: 'Photo not modified',
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

describe('MPDetailScraper', () => {
  let scraper: MPDetailScraper
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let mockWhere: jest.Mock
  let mockLimit: jest.Mock
  let mockInsert: jest.Mock
  let mockUpdate: jest.Mock
  let mockSet: jest.Mock
  let mockValues: jest.Mock

  // Helper to create a thenable object that can be awaited AND has a limit method
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
    jest.useFakeTimers()
    scraper = new MPDetailScraper()

    // Setup database mock chain for select queries
    mockLimit = jest.fn().mockResolvedValue([])
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

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('URL slug generation', () => {
    it('should generate correct URL slug for simple names', () => {
      const slug = (scraper as any).generateMpUrlSlug('John', 'Smith', '12345')
      expect(slug).toBe('John-Smith(12345)')
    })

    it('should generate correct URL slug for names with hyphens', () => {
      const slug = (scraper as any).generateMpUrlSlug('Jean-Yves', 'Blanchet', '67890')
      expect(slug).toBe('Jean-Yves-Blanchet(67890)')
    })

    it('should generate correct URL slug for names with spaces', () => {
      const slug = (scraper as any).generateMpUrlSlug('Xavier', 'Barsalou Duval', '11111')
      expect(slug).toBe('Xavier-Barsalou-Duval(11111)')
    })

    it('should generate correct URL slug for names with accents', () => {
      const slug = (scraper as any).generateMpUrlSlug('Josée', 'Verner', '22222')
      // Accents should be URL encoded
      expect(slug).toContain('(22222)')
      expect(slug).toMatch(/^[a-zA-Z0-9\-.'%]+\(22222\)$/)
    })
  })

  describe('XML parsing', () => {
    beforeEach(() => {
      // Use real timers for XML parsing tests (setImmediate needs real timers)
      jest.useRealTimers()
    })

    afterEach(() => {
      // Restore fake timers after each test
      jest.useFakeTimers()
    })

    it('should parse valid MP detail XML', async () => {
      const mockXML = `<?xml version="1.0" encoding="UTF-8"?>
<MemberOfParliament>
  <PersonId>12345</PersonId>
  <PersonShortHonorific>Mr.</PersonShortHonorific>
  <PersonOfficialFirstName>John</PersonOfficialFirstName>
  <PersonOfficialLastName>Smith</PersonOfficialLastName>
  <ConstituencyName>Toronto Centre</ConstituencyName>
  <ConstituencyProvinceTerritoryName>Ontario</ConstituencyProvinceTerritoryName>
  <CaucusShortName>Liberal</CaucusShortName>
  <FromDateTime>2024-01-01T00:00:00</FromDateTime>
  <ParliamentNumber>44</ParliamentNumber>
  <SessionNumber>1</SessionNumber>
  <AffiliationRoleName>Member</AffiliationRoleName>
  <CommitteeMemberRole>
    <CommitteeName>Standing Committee on Finance</CommitteeName>
    <AffiliationRoleName>Member</AffiliationRoleName>
    <FromDateTime>2024-01-15T00:00:00</FromDateTime>
  </CommitteeMemberRole>
</MemberOfParliament>`

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonShortHonorific: ['Mr.'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
            CaucusShortName: ['Liberal'],
            FromDateTime: ['2024-01-01T00:00:00'],
            ParliamentNumber: ['44'],
            SessionNumber: ['1'],
            AffiliationRoleName: ['Member'],
            CommitteeMemberRole: [
              {
                CommitteeName: ['Standing Committee on Finance'],
                AffiliationRoleName: ['Member'],
                FromDateTime: ['2024-01-15T00:00:00'],
              },
            ],
          },
        }
        // Use setImmediate instead of process.nextTick for better Jest compatibility
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).parseMPDetailXML(
        mockXML,
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data).toMatchObject({
        personId: '12345',
        firstName: 'John',
        lastName: 'Smith',
        fullName: 'John Smith',
        constituencyName: 'Toronto Centre',
        province: 'Ontario',
        caucusShortName: 'Liberal',
        parliamentNumber: 44,
        sessionNumber: 1,
        affiliationRoleName: 'Member',
      })
      expect(result.data?.committeeRoles).toBeDefined()
      expect(result.data?.committeeRoles?.length).toBe(1)
      expect(result.data?.committeeRoles?.[0]).toMatchObject({
        committeeName: 'Standing Committee on Finance',
        affiliationRoleName: 'Member',
      })
    })

    it('should handle XML with attributes', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: [{ _: '12345' }],
            PersonOfficialFirstName: [{ _: 'John' }],
            PersonOfficialLastName: [{ _: 'Smith' }],
            ConstituencyName: [{ _: 'Toronto Centre' }],
            ConstituencyProvinceTerritoryName: [{ _: 'Ontario' }],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).parseMPDetailXML(
        '<xml>test</xml>',
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(true)
      expect(result.data?.personId).toBe('12345')
    })

    it('should skip committee roles with missing committee names', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
            CommitteeMemberRole: [
              {
                CommitteeName: ['Standing Committee on Finance'],
                AffiliationRoleName: ['Member'],
              },
              {
                // Missing CommitteeName - should be skipped
                AffiliationRoleName: ['Member'],
              },
            ],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).parseMPDetailXML(
        '<xml>test</xml>',
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(true)
      expect(result.data?.committeeRoles?.length).toBe(1)
      expect(result.data?.committeeRoles?.[0].committeeName).toBe('Standing Committee on Finance')
    })

    it('should handle missing required fields', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            // Missing ConstituencyName
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).parseMPDetailXML(
        '<xml>test</xml>',
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Missing required fields')
    })

    it('should handle invalid dates gracefully', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
            FromDateTime: ['invalid-date'],
            CommitteeMemberRole: [
              {
                CommitteeName: ['Standing Committee on Finance'],
                FromDateTime: ['also-invalid'],
              },
            ],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).parseMPDetailXML(
        '<xml>test</xml>',
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(true)
      expect(result.data?.fromDateTime).toBeUndefined()
      expect(result.data?.committeeRoles?.[0].fromDateTime).toBeUndefined()
    })

    it('should parse parliamentary positions', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
            ParliamentaryPositionRole: [
              {
                ParliamentaryPositionRole: ['Speaker'],
                Title: ['Speaker of the House'],
                FromDateTime: ['2024-01-01T00:00:00'],
              },
            ],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).parseMPDetailXML(
        '<xml>test</xml>',
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(true)
      expect(result.data?.parliamentaryPositions).toBeDefined()
      expect(result.data?.parliamentaryPositions?.length).toBe(1)
      expect(result.data?.parliamentaryPositions?.[0]).toMatchObject({
        parliamentaryPositionRole: 'Speaker',
        title: 'Speaker of the House',
      })
    })

    it('should parse caucus roles', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
            CaucusMemberRole: [
              {
                CaucusMemberRole: ['Member'],
                CaucusShortName: ['Liberal'],
                ParliamentNumber: ['44'],
              },
            ],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).parseMPDetailXML(
        '<xml>test</xml>',
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(true)
      expect(result.data?.caucusRoles).toBeDefined()
      expect(result.data?.caucusRoles?.length).toBe(1)
      expect(result.data?.caucusRoles?.[0]).toMatchObject({
        caucusMemberRole: 'Member',
        caucusShortName: 'Liberal',
        parliamentNumber: 44,
      })
    })

    it('should parse election candidate roles', async () => {
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
            ElectionCandidateRole: [
              {
                ElectionCandidateRole: ['Candidate'],
                ElectionEventTypeName: ['General Election'],
                ConstituencyName: ['Toronto Centre'],
                PoliticalPartyName: ['Liberal'],
                ResolvedElectionResultTypeName: ['Elected'],
              },
            ],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).parseMPDetailXML(
        '<xml>test</xml>',
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(true)
      expect(result.data?.electionCandidateRoles).toBeDefined()
      expect(result.data?.electionCandidateRoles?.length).toBe(1)
      expect(result.data?.electionCandidateRoles?.[0]).toMatchObject({
        electionCandidateRole: 'Candidate',
        electionEventTypeName: 'General Election',
        constituencyName: 'Toronto Centre',
        politicalPartyName: 'Liberal',
        resolvedElectionResultTypeName: 'Elected',
      })
    })
  })

  describe('Rate limiting', () => {
    it('should delay 1 second between MP requests', async () => {
      // Use real timers for this test to test actual delays
      jest.useRealTimers()
      
      const activeMPs = [
        { id: 1, personId: '12345', fullName: 'John Smith' },
        { id: 2, personId: '67890', fullName: 'Jane Doe' },
      ]

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
          },
        }
        setImmediate(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<xml>test</xml>',
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<xml>test</xml>',
        })

      const delaySpy = jest.spyOn(scraper as any, 'delay')

      await (scraper as any).scrapeXML()

      // Should have called delay once (between the two MPs)
      expect(delaySpy).toHaveBeenCalledWith(1000)
      
      // Restore fake timers
      jest.useFakeTimers()
    }, 10000) // Increase timeout for real delays
  })

  describe('Retry logic', () => {
    beforeEach(() => {
      // Use real timers for retry logic tests
      jest.useRealTimers()
    })

    afterEach(() => {
      // Restore fake timers after each test
      jest.useFakeTimers()
    })

    it('should retry failed requests up to 4 times with exponential backoff', async () => {
      const activeMPs = [{ id: 1, personId: '12345', fullName: 'John Smith' }]

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      // Mock fetch to fail 3 times, then succeed
      ;(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<xml>test</xml>',
        })

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const delaySpy = jest.spyOn(scraper as any, 'delay')

      await (scraper as any).scrapeXML()

      // Should have retried with exponential backoff: 1s, 2s, 4s
      expect(delaySpy).toHaveBeenCalledWith(1000) // After attempt 1
      expect(delaySpy).toHaveBeenCalledWith(2000) // After attempt 2
      expect(delaySpy).toHaveBeenCalledWith(4000) // After attempt 3
      expect(global.fetch).toHaveBeenCalledTimes(4) // Initial + 3 retries
    }, 15000) // Increase timeout for real delays (1s + 2s + 4s = 7s minimum)

    it('should fallback to HTML scraping after 4 failed attempts', async () => {
      const activeMPs = [{ id: 1, personId: '12345', fullName: 'John Smith' }]

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      // Mock fetch to fail all 4 times
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const result = await (scraper as any).scrapeXML()

      // Should have attempted 4 times
      expect(global.fetch).toHaveBeenCalledTimes(4)
      // Should have logged failed MPs for HTML fallback
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    }, 15000) // Increase timeout for real delays

    it('should handle HTTP errors in retry logic', async () => {
      const activeMPs = [{ id: 1, personId: '12345', fullName: 'John Smith' }]

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      // Mock fetch to return HTTP errors
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<xml>test</xml>',
        })

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
          },
        }
        setImmediate(() => callback(null, result))
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledTimes(3)
    }, 10000) // Increase timeout for real delays
  })

  describe('Committee data storage', () => {
    it('should save committee roles to database', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
          committeeRoles: [
            {
              committeeName: 'Standing Committee on Finance',
              affiliationRoleName: 'Member',
              fromDateTime: new Date('2024-01-15'),
            },
          ],
        },
      ]

      // Mock: existing MP found
      const existingMP = {
        id: 1,
        personId: '12345',
        fullName: 'John Smith',
      }
      // Setup mockLimit for both queries:
      // 1. Finding MP: db.select().from(mps).where(...).limit(1) - returns [existingMP]
      // 2. Checking committee role: db.select().from(committeeParticipation).where(...).limit(1) - returns [] (no existing role)
      mockLimit
        .mockResolvedValueOnce([existingMP]) // For finding MP
        .mockResolvedValueOnce([]) // For checking existing committee role (none found)

      // Mock: no existing committee role
      mockWhere
        .mockReturnValueOnce(createThenableWithLimit([existingMP])) // Find MP
        .mockReturnValueOnce(createThenableWithLimit([])) // Check existing committee role

      await (scraper as any).saveToDatabase(mpData)

      // The code first updates mps, then inserts committeeParticipation
      expect(db.update).toHaveBeenCalledWith(mps) // MP is updated first
      expect(db.insert).toHaveBeenCalledWith(committeeParticipation)
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          mpId: 1,
          committeeName: 'Standing Committee on Finance',
          role: 'Member',
        })
      )
    })

    it('should update existing committee roles', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
          committeeRoles: [
            {
              committeeName: 'Standing Committee on Finance',
              affiliationRoleName: 'Chair',
              fromDateTime: new Date('2024-02-01'),
            },
          ],
        },
      ]

      // Mock: existing MP found (needs photoUrl and photoLastModified for photo processing)
      const existingMP = {
        id: 1,
        personId: '12345',
        fullName: 'John Smith',
        photoUrl: null,
        photoLastModified: null,
      }

      // Mock: existing committee role found
      const existingRole = {
        id: 10,
        mpId: 1,
        committeeName: 'Standing Committee on Finance',
        role: 'Member',
      }
      
      // Setup mocks for the database queries:
      // 1. Find MP: db.select().from(mps).where(...).limit(1) - limit() returns [existingMP]
      // 2. Find committee role: db.select().from(committeeParticipation).where(...).limit(1) - limit() returns [existingRole]
      // The limit() method on the thenable calls mockLimit, which should return the array
      mockLimit
        .mockResolvedValueOnce([existingMP]) // For finding MP (first limit() call)
        .mockResolvedValueOnce([existingRole]) // For finding committee role (second limit() call)
      
      // mockWhere returns a thenable that has a limit() method
      // When limit() is called, it uses mockLimit which we've set up above
      mockWhere
        .mockReturnValueOnce(createThenableWithLimit([existingMP], mockLimit)) // Find MP
        .mockReturnValueOnce(createThenableWithLimit([existingRole], mockLimit)) // Check existing committee role

      await (scraper as any).saveToDatabase(mpData)

      // The code first updates mps, then updates committeeParticipation
      expect(db.update).toHaveBeenCalledTimes(2)
      expect(db.update).toHaveBeenNthCalledWith(1, mps) // First update is for MP
      expect(db.update).toHaveBeenNthCalledWith(2, committeeParticipation) // Second update is for committee role
      
      // Check the committee role update - mockSet is called for each update
      // The second call to mockSet should be for the committee update
      expect(mockSet).toHaveBeenCalledTimes(2)
      const committeeSetCall = mockSet.mock.calls[1]
      expect(committeeSetCall[0]).toEqual(
        expect.objectContaining({
          role: 'Chair',
        })
      )
    })

    it('should handle multiple committee roles per MP', async () => {
      const mpData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
          committeeRoles: [
            {
              committeeName: 'Standing Committee on Finance',
              affiliationRoleName: 'Member',
            },
            {
              committeeName: 'Standing Committee on Health',
              affiliationRoleName: 'Vice-Chair',
            },
          ],
        },
      ]

      const existingMP = {
        id: 1,
        personId: '12345',
        fullName: 'John Smith',
      }
      // Setup mockLimit for all three queries:
      // 1. Finding MP: db.select().from(mps).where(...).limit(1) - returns [existingMP]
      // 2. Checking first committee role: db.select().from(committeeParticipation).where(...).limit(1) - returns [] (not found)
      // 3. Checking second committee role: db.select().from(committeeParticipation).where(...).limit(1) - returns [] (not found)
      mockLimit
        .mockResolvedValueOnce([existingMP]) // For finding MP
        .mockResolvedValueOnce([]) // For checking first committee role (none found)
        .mockResolvedValueOnce([]) // For checking second committee role (none found)

      // Mock: no existing committee roles
      mockWhere
        .mockReturnValueOnce(createThenableWithLimit([existingMP])) // Find MP
        .mockReturnValueOnce(createThenableWithLimit([])) // First committee role
        .mockReturnValueOnce(createThenableWithLimit([])) // Second committee role

      await (scraper as any).saveToDatabase(mpData)

      // Should insert both committee roles
      expect(mockValues).toHaveBeenCalledTimes(2)
    })

    it('should skip MPs without personId', async () => {
      // Use real timers for this test since it involves async operations
      jest.useRealTimers()
      
      const activeMPs = [
        { id: 1, personId: null, fullName: 'John Smith' },
        { id: 2, personId: '12345', fullName: 'Jane Doe' },
      ]

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['Jane'],
            PersonOfficialLastName: ['Doe'],
            ConstituencyName: ['Ottawa Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
          },
        }
        setImmediate(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<xml>test</xml>',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      // Should only process the MP with personId
      expect(result.data?.length).toBe(1)
      
      // Restore fake timers
      jest.useFakeTimers()
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

    it('should handle XML parsing errors', async () => {
      // Use real timers for this test since it involves async operations
      jest.useRealTimers()
      
      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        setImmediate(() => callback(new Error('Parse error'), null))
      })

      const result = await (scraper as any).parseMPDetailXML(
        '<invalid>xml',
        '12345',
        'John',
        'Smith'
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      
      // Restore fake timers
      jest.useFakeTimers()
    })

    it('should handle network timeouts', async () => {
      // Use real timers for this test since it involves async operations and retries
      jest.useRealTimers()
      
      const activeMPs = [{ id: 1, personId: '12345', fullName: 'John Smith' }]

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      ;(global.fetch as jest.Mock).mockRejectedValue(
        new Error('Request timeout')
      )

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      // Should have attempted retries and logged for HTML fallback
      expect(result.data).toBeDefined()
      
      // Restore fake timers
      jest.useFakeTimers()
    }, 15000) // Increase timeout for retries (4 attempts with delays)

    it('should handle MPs with unparseable names', async () => {
      const activeMPs = [{ id: 1, personId: '12345', fullName: 'SingleName' }]

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      // Should skip MP with unparseable name
      expect(result.data?.length).toBe(0)
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
      ]

      const result = (scraper as any).validateData(invalidData)

      expect(result.isValid).toBe(false)
      expect(result.anomalies.some((a: string) => a.includes('missing required fields'))).toBe(
        true
      )
    })

    it('should flag invalid dates in committee roles', () => {
      const invalidDateData = [
        {
          personId: '12345',
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          constituencyName: 'Toronto Centre',
          province: 'Ontario',
          committeeRoles: [
            {
              committeeName: 'Standing Committee on Finance',
              fromDateTime: new Date('invalid'),
              toDateTime: new Date('invalid'),
            },
          ],
        },
      ]

      const result = (scraper as any).validateData(invalidDateData)

      expect(result.isValid).toBe(false)
      expect(result.anomalies.some((a: string) => a.includes('invalid dates'))).toBe(true)
    })
  })

  describe('getSourceUrl', () => {
    it('should return the correct base URL', () => {
      const url = (scraper as any).getSourceUrl()
      expect(url).toBe('https://www.ourcommons.ca/Members/en')
    })
  })

  describe('Dry run mode', () => {
    it('should process only first 5 active MPs in dry run mode', async () => {
      // Use real timers for this test since it involves async operations
      jest.useRealTimers()
      
      const originalEnv = process.env.MP_SCRAPER_DRY_RUN
      process.env.MP_SCRAPER_DRY_RUN = 'true'

      const activeMPs = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        personId: `${i}`,
        fullName: `MP ${i}`,
      }))

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['0'],
            PersonOfficialFirstName: ['MP'],
            PersonOfficialLastName: ['0'],
            ConstituencyName: ['Constituency 0'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
          },
        }
        setImmediate(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => '<xml>test</xml>',
      })

      const result = await (scraper as any).scrapeXML()

      expect(result.success).toBe(true)
      // Should only process first 5 MPs
      expect(global.fetch).toHaveBeenCalledTimes(5)

      // Restore environment variable
      if (originalEnv === undefined) {
        delete process.env.MP_SCRAPER_DRY_RUN
      } else {
        process.env.MP_SCRAPER_DRY_RUN = originalEnv
      }
      
      // Restore fake timers
      jest.useFakeTimers()
    }, 10000) // Increase timeout for 5 requests with delays
  })

  describe('Full workflow', () => {
    it('should run complete scrape workflow', async () => {
      // Use real timers for this test since it involves async operations
      jest.useRealTimers()
      
      const activeMPs = [{ id: 1, personId: '12345', fullName: 'John Smith' }]

      mockWhere.mockReturnValueOnce(createThenableWithLimit(activeMPs))

      const { parseString } = require('xml2js')
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        const result = {
          MemberOfParliament: {
            PersonId: ['12345'],
            PersonOfficialFirstName: ['John'],
            PersonOfficialLastName: ['Smith'],
            ConstituencyName: ['Toronto Centre'],
            ConstituencyProvinceTerritoryName: ['Ontario'],
          },
        }
        setImmediate(() => callback(null, result))
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<xml>test</xml>',
      })

      mockLimit.mockResolvedValueOnce([{ id: 1, personId: '12345', fullName: 'John Smith' }])
      mockWhere
        .mockReturnValueOnce(createThenableWithLimit([{ id: 1, personId: '12345', fullName: 'John Smith' }]))
        .mockReturnValueOnce(createThenableWithLimit([]))

      const result = await scraper.run()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.sourceUrl).toBe('https://www.ourcommons.ca/Members/en')
      
      // Restore fake timers
      jest.useFakeTimers()
    })
  })
})

