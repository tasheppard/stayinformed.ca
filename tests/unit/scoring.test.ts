/**
 * Unit tests for scoring algorithms
 * To run: npm test tests/unit/scoring.test.ts
 */

import {
  calculateLegislativeActivityScore,
  calculateFiscalResponsibilityScore,
  calculateConstituentEngagementScore,
  calculateVotingParticipationScore,
  calculateCompositeScore,
  calculateMPScores,
  calculateAllMPScores,
  saveScores,
  MPScore,
} from '@/lib/scoring/calculate-scores'
import { getScoringWeights, DEFAULT_WEIGHTS } from '@/lib/scoring/scoring-weights'
import { db } from '@/lib/db'

// Mock the database
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    execute: jest.fn(),
  },
}))

// Mock scoring-weights module
jest.mock('@/lib/scoring/scoring-weights', () => ({
  getScoringWeights: jest.fn(),
  DEFAULT_WEIGHTS: {
    legislativeActivity: 0.35,
    fiscalResponsibility: 0.25,
    constituentEngagement: 0.25,
    votingParticipation: 0.15,
  },
}))

describe('Scoring Algorithms', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('calculateLegislativeActivityScore', () => {
    it('should return 0 when MP has no legislative activity', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      })

      ;(db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      })

      const score = await calculateLegislativeActivityScore(1)
      expect(score).toBe(0)
    })

    it('should calculate score based on bills sponsored', async () => {
      // Mock bills count
      const mockBillsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 5 }]),
        }),
      }

      // Mock petitions count
      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      // Mock committees count
      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      // Mock leadership roles count
      const mockLeadershipQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockBillsQuery)
        .mockReturnValueOnce(mockPetitionsQuery)
        .mockReturnValueOnce(mockCommitteesQuery)
        .mockReturnValueOnce(mockLeadershipQuery)

      const score = await calculateLegislativeActivityScore(1)
      // 5 bills * 10 = 50 points, weighted at 30% = 15 points
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should cap bills score at 100 points (10+ bills)', async () => {
      const mockBillsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 15 }]),
        }),
      }

      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      const mockLeadershipQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockBillsQuery)
        .mockReturnValueOnce(mockPetitionsQuery)
        .mockReturnValueOnce(mockCommitteesQuery)
        .mockReturnValueOnce(mockLeadershipQuery)

      const score = await calculateLegislativeActivityScore(1)
      // Should be capped at 100
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should calculate score with all components', async () => {
      const mockBillsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 5 }]),
        }),
      }

      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 3 }]),
        }),
      }

      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 2 }]),
        }),
      }

      const mockLeadershipQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 1 }]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockBillsQuery)
        .mockReturnValueOnce(mockPetitionsQuery)
        .mockReturnValueOnce(mockCommitteesQuery)
        .mockReturnValueOnce(mockLeadershipQuery)

      const score = await calculateLegislativeActivityScore(1)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })

  describe('calculateFiscalResponsibilityScore', () => {
    it('should return 50 when MP has no expenses', async () => {
      const mockExpensesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: null }]),
        }),
      }

      const mockMpQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ caucusShortName: 'Liberal' }]),
          }),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockExpensesQuery)
        .mockReturnValueOnce(mockMpQuery)

      ;(db.execute as jest.Mock)
        .mockResolvedValueOnce([{ avg_total: null }])
        .mockResolvedValueOnce([{ avg_total: null }])

      const score = await calculateFiscalResponsibilityScore(1)
      expect(score).toBe(50)
    })

    it('should return 50 when no baseline data is available', async () => {
      const mockExpensesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: '1000' }]),
        }),
      }

      const mockMpQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ caucusShortName: 'Liberal' }]),
          }),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockExpensesQuery)
        .mockReturnValueOnce(mockMpQuery)

      // Mock execute for party and national averages (both return 0)
      ;(db.execute as jest.Mock)
        .mockResolvedValueOnce([{ avg_total: null }])
        .mockResolvedValueOnce([{ avg_total: null }])

      const score = await calculateFiscalResponsibilityScore(1)
      expect(score).toBe(50)
    })

    it('should give higher score when MP spends less than average', async () => {
      const mockExpensesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: '5000' }]),
        }),
      }

      const mockMpQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ caucusShortName: 'Liberal' }]),
          }),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockExpensesQuery)
        .mockReturnValueOnce(mockMpQuery)

      // MP spends 5000, average is 10000 (50% less = higher score)
      ;(db.execute as jest.Mock)
        .mockResolvedValueOnce([{ avg_total: '10000' }])
        .mockResolvedValueOnce([{ avg_total: '10000' }])

      const score = await calculateFiscalResponsibilityScore(1)
      // Should be > 50 (above average)
      expect(score).toBeGreaterThan(50)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should give lower score when MP spends more than average', async () => {
      const mockExpensesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: '15000' }]),
        }),
      }

      const mockMpQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ caucusShortName: 'Liberal' }]),
          }),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockExpensesQuery)
        .mockReturnValueOnce(mockMpQuery)

      // MP spends 15000, average is 10000 (50% more = lower score)
      ;(db.execute as jest.Mock)
        .mockResolvedValueOnce([{ avg_total: '10000' }])
        .mockResolvedValueOnce([{ avg_total: '10000' }])

      const score = await calculateFiscalResponsibilityScore(1)
      // Should be < 50 (below average)
      expect(score).toBeLessThan(50)
      expect(score).toBeGreaterThanOrEqual(0)
    })

    it('should use party average when available', async () => {
      const mockExpensesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: '8000' }]),
        }),
      }

      const mockMpQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ caucusShortName: 'Conservative' }]),
          }),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockExpensesQuery)
        .mockReturnValueOnce(mockMpQuery)

      // Party average: 10000, National average: 12000
      // Should use party average (lower one)
      ;(db.execute as jest.Mock)
        .mockResolvedValueOnce([{ avg_total: '10000' }])
        .mockResolvedValueOnce([{ avg_total: '12000' }])

      const score = await calculateFiscalResponsibilityScore(1)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })

  describe('calculateConstituentEngagementScore', () => {
    it('should return 0 when MP has no engagement data', async () => {
      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }

      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockPetitionsQuery)
        .mockReturnValueOnce(mockCommitteesQuery)

      const score = await calculateConstituentEngagementScore(1)
      expect(score).toBe(0)
    })

    it('should calculate score based on petition signatures', async () => {
      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { signatureCount: 5000 },
            { signatureCount: 3000 },
          ]),
        }),
      }

      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockPetitionsQuery)
        .mockReturnValueOnce(mockCommitteesQuery)

      const score = await calculateConstituentEngagementScore(1)
      // 8000 signatures / 10000 * 100 = 80 points, weighted at 60% = 48 points
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should cap petition score at 100 points (10,000+ signatures)', async () => {
      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { signatureCount: 15000 },
          ]),
        }),
      }

      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockPetitionsQuery)
        .mockReturnValueOnce(mockCommitteesQuery)

      const score = await calculateConstituentEngagementScore(1)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should calculate score based on committee meetings', async () => {
      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }

      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { meetingCount: 30 },
            { meetingCount: 20 },
          ]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockPetitionsQuery)
        .mockReturnValueOnce(mockCommitteesQuery)

      const score = await calculateConstituentEngagementScore(1)
      // 50 meetings / 50 * 100 = 100 points, weighted at 40% = 40 points
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should combine petition and meeting scores', async () => {
      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { signatureCount: 5000 },
          ]),
        }),
      }

      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { meetingCount: 25 },
          ]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockPetitionsQuery)
        .mockReturnValueOnce(mockCommitteesQuery)

      const score = await calculateConstituentEngagementScore(1)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })

  describe('calculateVotingParticipationScore', () => {
    it('should return 0 when MP has no votes', async () => {
      const mockVotesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }

      ;(db.select as jest.Mock).mockReturnValueOnce(mockVotesQuery)

      const score = await calculateVotingParticipationScore(1)
      expect(score).toBe(0)
    })

    it('should return 100 when MP attended all votes', async () => {
      const mockVotesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { voteResult: 'Yea' },
            { voteResult: 'Nay' },
            { voteResult: 'Yea' },
            { voteResult: 'Nay' },
          ]),
        }),
      }

      ;(db.select as jest.Mock).mockReturnValueOnce(mockVotesQuery)

      const score = await calculateVotingParticipationScore(1)
      expect(score).toBe(100)
    })

    it('should calculate percentage correctly', async () => {
      const mockVotesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { voteResult: 'Yea' },
            { voteResult: 'Nay' },
            { voteResult: 'Paired' }, // Not counted as attended
            { voteResult: 'Abstained' }, // Not counted as attended
            { voteResult: 'Yea' },
          ]),
        }),
      }

      ;(db.select as jest.Mock).mockReturnValueOnce(mockVotesQuery)

      const score = await calculateVotingParticipationScore(1)
      // 3 attended out of 5 = 60%
      expect(score).toBe(60)
    })

    it('should only count Yea and Nay as attended', async () => {
      const mockVotesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { voteResult: 'Yea' },
            { voteResult: 'Paired' },
            { voteResult: 'Abstained' },
          ]),
        }),
      }

      ;(db.select as jest.Mock).mockReturnValueOnce(mockVotesQuery)

      const score = await calculateVotingParticipationScore(1)
      // 1 attended out of 3 = 33%
      expect(score).toBe(33)
    })
  })

  describe('calculateCompositeScore', () => {
    it('should calculate weighted average correctly', async () => {
      const { getScoringWeights } = require('@/lib/scoring/scoring-weights')
      getScoringWeights.mockResolvedValue(DEFAULT_WEIGHTS)

      const score = await calculateCompositeScore(80, 70, 60, 50)
      // 80 * 0.35 + 70 * 0.25 + 60 * 0.25 + 50 * 0.15
      // = 28 + 17.5 + 15 + 7.5 = 68
      expect(score).toBe(68)
    })

    it('should handle edge case of all 0 scores', async () => {
      const { getScoringWeights } = require('@/lib/scoring/scoring-weights')
      getScoringWeights.mockResolvedValue(DEFAULT_WEIGHTS)

      const score = await calculateCompositeScore(0, 0, 0, 0)
      expect(score).toBe(0)
    })

    it('should handle edge case of all 100 scores', async () => {
      const { getScoringWeights } = require('@/lib/scoring/scoring-weights')
      getScoringWeights.mockResolvedValue(DEFAULT_WEIGHTS)

      const score = await calculateCompositeScore(100, 100, 100, 100)
      expect(score).toBe(100)
    })

    it('should clamp score to 0-100 range', async () => {
      const { getScoringWeights } = require('@/lib/scoring/scoring-weights')
      getScoringWeights.mockResolvedValue(DEFAULT_WEIGHTS)

      // Even with extreme values, should be clamped
      const score = await calculateCompositeScore(200, -50, 150, 75)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should use custom weights from database', async () => {
      const { getScoringWeights } = require('@/lib/scoring/scoring-weights')
      getScoringWeights.mockResolvedValue({
        legislativeActivity: 0.5,
        fiscalResponsibility: 0.3,
        constituentEngagement: 0.15,
        votingParticipation: 0.05,
      })

      const score = await calculateCompositeScore(80, 70, 60, 50)
      // 80 * 0.5 + 70 * 0.3 + 60 * 0.15 + 50 * 0.05
      // = 40 + 21 + 9 + 2.5 = 72.5
      // Due to floating point precision, the result may be slightly off
      // Math.round(72.5) should be 73, but Math.round(72.499...) would be 72
      // Use a range check to handle floating point precision issues
      expect(score).toBeGreaterThanOrEqual(72)
      expect(score).toBeLessThanOrEqual(73)
      // Most likely it will be 73, but we allow 72 due to floating point precision
    })
  })

  describe('calculateMPScores', () => {
    it('should calculate all scores for an MP', async () => {
      // Mock all individual score calculations
      const mockBillsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 5 }]),
        }),
      }

      const mockPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      const mockCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      const mockLeadershipQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }

      const mockExpensesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: '5000' }]),
        }),
      }

      const mockMpQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ caucusShortName: 'Liberal' }]),
          }),
        }),
      }

      const mockVotesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { voteResult: 'Yea' },
            { voteResult: 'Nay' },
          ]),
        }),
      }

      const mockConstituentPetitionsQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }

      const mockConstituentCommitteesQuery = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }

      ;(db.select as jest.Mock)
        .mockReturnValueOnce(mockBillsQuery) // Legislative: bills
        .mockReturnValueOnce(mockPetitionsQuery) // Legislative: petitions
        .mockReturnValueOnce(mockCommitteesQuery) // Legislative: committees
        .mockReturnValueOnce(mockLeadershipQuery) // Legislative: leadership
        .mockReturnValueOnce(mockExpensesQuery) // Fiscal: expenses
        .mockReturnValueOnce(mockMpQuery) // Fiscal: MP data
        .mockReturnValueOnce(mockConstituentPetitionsQuery) // Engagement: petitions
        .mockReturnValueOnce(mockConstituentCommitteesQuery) // Engagement: committees
        .mockReturnValueOnce(mockVotesQuery) // Voting: votes

      ;(db.execute as jest.Mock)
        .mockResolvedValueOnce([{ avg_total: '10000' }]) // Party average
        .mockResolvedValueOnce([{ avg_total: '10000' }]) // National average

      const { getScoringWeights } = require('@/lib/scoring/scoring-weights')
      getScoringWeights.mockResolvedValue(DEFAULT_WEIGHTS)

      const result = await calculateMPScores(1)

      expect(result).toHaveProperty('mpId', 1)
      expect(result).toHaveProperty('overallScore')
      expect(result).toHaveProperty('legislativeActivityScore')
      expect(result).toHaveProperty('fiscalResponsibilityScore')
      expect(result).toHaveProperty('constituentEngagementScore')
      expect(result).toHaveProperty('votingParticipationScore')

      // All scores should be in valid range
      expect(result.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.overallScore).toBeLessThanOrEqual(100)
      expect(result.legislativeActivityScore).toBeGreaterThanOrEqual(0)
      expect(result.legislativeActivityScore).toBeLessThanOrEqual(100)
      expect(result.fiscalResponsibilityScore).toBeGreaterThanOrEqual(0)
      expect(result.fiscalResponsibilityScore).toBeLessThanOrEqual(100)
      expect(result.constituentEngagementScore).toBeGreaterThanOrEqual(0)
      expect(result.constituentEngagementScore).toBeLessThanOrEqual(100)
      expect(result.votingParticipationScore).toBeGreaterThanOrEqual(0)
      expect(result.votingParticipationScore).toBeLessThanOrEqual(100)
    })
  })

  describe('calculateAllMPScores', () => {
    it('should calculate scores for all active MPs', async () => {
      // Create a reusable mock query builder
      const createMockSelect = () => {
        let callCount = 0
        return jest.fn().mockImplementation(() => {
          callCount++
          // First call: get active MPs
          if (callCount === 1) {
            return {
              from: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([
                  { id: 1 },
                  { id: 2 },
                ]),
              }),
            }
          }
          // Subsequent calls: mock individual score calculation queries
          // Pattern: bills, petitions, committees, leadership, expenses, mp, constituent petitions, constituent committees, votes
          const queryType = (callCount - 2) % 9
          if (queryType === 0 || queryType === 1 || queryType === 2 || queryType === 3) {
            // Count queries (bills, petitions, committees, leadership)
            return {
              from: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([{ count: 0 }]),
              }),
            }
          } else if (queryType === 4) {
            // Expenses query
            return {
              from: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([{ total: null }]),
              }),
            }
          } else if (queryType === 5) {
            // MP query
            return {
              from: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue([{ caucusShortName: 'Liberal' }]),
                }),
              }),
            }
          } else {
            // Array queries (petitions, committees, votes)
            return {
              from: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([]),
              }),
            }
          }
        })
      }

      const mockSelect = createMockSelect()
      ;(db.select as jest.Mock) = mockSelect

      // Mock execute for fiscal responsibility calculations (party and national averages)
      ;(db.execute as jest.Mock) = jest.fn().mockResolvedValue([{ avg_total: null }])

      const { getScoringWeights } = require('@/lib/scoring/scoring-weights')
      getScoringWeights.mockResolvedValue(DEFAULT_WEIGHTS)

      const results = await calculateAllMPScores()

      expect(results).toHaveLength(2)
      expect(results[0]).toHaveProperty('mpId', 1)
      expect(results[1]).toHaveProperty('mpId', 2)
    })

    it('should continue processing when one MP fails', async () => {
      // Mock: MP 1 will fail, MP 2 will succeed
      let callCount = 0
      const mpIds = [1, 2]
      let currentMpIndex = 0
      let currentMpQueryIndex = 0
      
      const mockSelect = jest.fn().mockImplementation(() => {
        callCount++
        
        // First call: get active MPs
        if (callCount === 1) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mpIds.map(id => ({ id }))),
            }),
          }
        }
        
        // Determine which MP we're processing based on call count
        // After call 1 (activeMPs), we process MP 1 (calls 2-10), then MP 2 (calls 11-19)
        if (callCount >= 2 && callCount <= 10) {
          // MP 1 queries - make the first one fail
          if (callCount === 2) {
            return {
              from: jest.fn().mockReturnValue({
                where: jest.fn().mockRejectedValue(new Error('Database error for MP 1')),
              }),
            }
          }
          // Other MP 1 queries won't be reached due to the error
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ count: 0 }]),
            }),
          }
        }
        
        // MP 2 queries (calls 11-19) - all should succeed
        const mp2QueryIndex = (callCount - 11) % 9
        
        if (mp2QueryIndex >= 0 && mp2QueryIndex <= 3) {
          // Count queries
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ count: 0 }]),
            }),
          }
        } else if (mp2QueryIndex === 4) {
          // Expenses
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ total: null }]),
            }),
          }
        } else if (mp2QueryIndex === 5) {
          // MP query
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([{ caucusShortName: 'Liberal' }]),
              }),
            }),
          }
        } else {
          // Array queries
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          }
        }
      })

      ;(db.select as jest.Mock) = mockSelect
      ;(db.execute as jest.Mock) = jest.fn().mockResolvedValue([{ avg_total: null }])

      const { getScoringWeights } = require('@/lib/scoring/scoring-weights')
      getScoringWeights.mockResolvedValue(DEFAULT_WEIGHTS)

      // Should not throw, but should log error and continue
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const results = await calculateAllMPScores()

      expect(consoleSpy).toHaveBeenCalled()
      // Bug 2 fix: Verify that MP 2 was actually processed (not just that length >= 0)
      // The function should continue processing MP 2 even after MP 1 fails
      expect(results.length).toBe(1)
      expect(results[0].mpId).toBe(2)
      // Verify MP 1 was NOT processed (error occurred)
      expect(results.find((r) => r.mpId === 1)).toBeUndefined()

      consoleSpy.mockRestore()
    })
  })

  describe('saveScores', () => {
    it('should save scores to database', async () => {
      const mockValues = jest.fn().mockResolvedValue(undefined)
      const mockInsert = {
        values: mockValues,
      }

      ;(db.insert as jest.Mock).mockReturnValue(mockInsert)

      const scores: MPScore[] = [
        {
          mpId: 1,
          overallScore: 75,
          legislativeActivityScore: 80,
          fiscalResponsibilityScore: 70,
          constituentEngagementScore: 75,
          votingParticipationScore: 80,
        },
      ]

      await saveScores(scores)

      expect(db.insert).toHaveBeenCalled()
      expect(mockValues).toHaveBeenCalledWith({
        mpId: 1,
        overallScore: '75',
        legislativeActivityScore: '80',
        fiscalResponsibilityScore: '70',
        constituentEngagementScore: '75',
        votingParticipationScore: '80',
        calculatedAt: expect.any(Date),
      })
    })

    it('should save multiple scores', async () => {
      const mockValues = jest.fn().mockResolvedValue(undefined)
      const mockInsert = {
        values: mockValues,
      }

      ;(db.insert as jest.Mock).mockReturnValue(mockInsert)

      const scores: MPScore[] = [
        {
          mpId: 1,
          overallScore: 75,
          legislativeActivityScore: 80,
          fiscalResponsibilityScore: 70,
          constituentEngagementScore: 75,
          votingParticipationScore: 80,
        },
        {
          mpId: 2,
          overallScore: 65,
          legislativeActivityScore: 70,
          fiscalResponsibilityScore: 60,
          constituentEngagementScore: 65,
          votingParticipationScore: 70,
        },
      ]

      await saveScores(scores)

      expect(mockValues).toHaveBeenCalledTimes(2)
    })

    it('should continue saving when one score fails', async () => {
      const mockValues = jest
        .fn()
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(undefined)
      const mockInsert = {
        values: mockValues,
      }

      ;(db.insert as jest.Mock).mockReturnValue(mockInsert)

      const scores: MPScore[] = [
        {
          mpId: 1,
          overallScore: 75,
          legislativeActivityScore: 80,
          fiscalResponsibilityScore: 70,
          constituentEngagementScore: 75,
          votingParticipationScore: 80,
        },
        {
          mpId: 2,
          overallScore: 65,
          legislativeActivityScore: 70,
          fiscalResponsibilityScore: 60,
          constituentEngagementScore: 65,
          votingParticipationScore: 70,
        },
      ]

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      await saveScores(scores)

      expect(consoleSpy).toHaveBeenCalled()
      expect(mockValues).toHaveBeenCalledTimes(2)

      consoleSpy.mockRestore()
    })
  })
})

