import { NextRequest } from 'next/server';
import { GET as geolocationGET } from '@/app/api/geolocation/route';
import { GET as scoresGET } from '@/app/api/scores/route';
import { GET as mpGET } from '@/app/api/mp/[slug]/route';
import { db } from '@/lib/db';
import { findMPByCoordinates, postalCodeToCoordinates } from '@/lib/utils/geolocation';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('@/lib/utils/geolocation', () => ({
  findMPByCoordinates: jest.fn(),
  postalCodeToCoordinates: jest.fn(),
}));

jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) =>
    fn(...args),
}));

const mockSelectWithLimit = (result: unknown[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue(result),
    }),
  }),
});

const mockSelectWithOrderBy = (result: unknown[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(result),
      }),
    }),
  }),
});

const mockSelectWithJoin = (result: unknown[]) => ({
  from: jest.fn().mockReturnValue({
    innerJoin: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(result),
    }),
  }),
});

describe('API integration tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/api/geolocation', () => {
    it('returns 400 when no parameters provided', async () => {
      const request = new NextRequest('http://localhost/api/geolocation');
      const response = await geolocationGET(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: 'Either lat/lng or postalCode must be provided',
      });
    });

    it('returns 400 when lat/lng are invalid', async () => {
      const request = new NextRequest(
        'http://localhost/api/geolocation?lat=abc&lng=10'
      );
      const response = await geolocationGET(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: 'Invalid latitude or longitude values',
      });
    });

    it('returns 404 when no MP is found', async () => {
      (findMPByCoordinates as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/geolocation?lat=45.4&lng=-73.6'
      );
      const response = await geolocationGET(request);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: 'No MP found for the given location',
      });
    });

    it('returns MP data when found', async () => {
      (findMPByCoordinates as jest.Mock).mockResolvedValue({
        id: 1,
        fullName: 'Test MP',
        slug: 'test-mp',
      });

      const request = new NextRequest(
        'http://localhost/api/geolocation?lat=45.4&lng=-73.6'
      );
      const response = await geolocationGET(request);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: 1,
        fullName: 'Test MP',
        slug: 'test-mp',
      });
    });

    it('returns 400 when postal code conversion fails', async () => {
      (postalCodeToCoordinates as jest.Mock).mockRejectedValue(
        new Error('Invalid postal code')
      );

      const request = new NextRequest(
        'http://localhost/api/geolocation?postalCode=INVALID'
      );
      const response = await geolocationGET(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: 'Invalid postal code',
      });
    });
  });

  describe('/api/scores', () => {
    it('returns 400 for invalid mpId', async () => {
      const request = new NextRequest(
        'http://localhost/api/scores?mpId=not-a-number'
      );
      const response = await scoresGET(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: 'Invalid mpId parameter',
      });
    });

    it('returns 404 when scores are missing for mpId', async () => {
      (db.select as jest.Mock).mockReturnValue(
        mockSelectWithOrderBy([])
      );

      const request = new NextRequest('http://localhost/api/scores?mpId=1');
      const response = await scoresGET(request);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: 'Scores not found for this MP',
      });
    });

    it('returns scores for a valid mpId', async () => {
      const score = {
        overallScore: 75,
        legislativeActivityScore: 70,
        fiscalResponsibilityScore: 80,
        constituentEngagementScore: 65,
        votingParticipationScore: 90,
        calculatedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      (db.select as jest.Mock).mockReturnValue(
        mockSelectWithOrderBy([score])
      );

      const request = new NextRequest('http://localhost/api/scores?mpId=1');
      const response = await scoresGET(request);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        mpId: 1,
        overallScore: 75,
        legislativeActivityScore: 70,
        fiscalResponsibilityScore: 80,
        constituentEngagementScore: 65,
        votingParticipationScore: 90,
      });
    });

    it('returns 404 when MP slug is not found', async () => {
      (db.select as jest.Mock).mockReturnValueOnce(
        mockSelectWithLimit([])
      );

      const request = new NextRequest('http://localhost/api/scores?slug=missing');
      const response = await scoresGET(request);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: 'MP not found',
      });
    });

    it('returns scores for a valid slug', async () => {
      const score = {
        overallScore: 82,
        legislativeActivityScore: 75,
        fiscalResponsibilityScore: 85,
        constituentEngagementScore: 70,
        votingParticipationScore: 95,
        calculatedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      (db.select as jest.Mock)
        .mockReturnValueOnce(mockSelectWithLimit([{ id: 42 }]))
        .mockReturnValueOnce(mockSelectWithOrderBy([score]));

      const request = new NextRequest('http://localhost/api/scores?slug=test-mp');
      const response = await scoresGET(request);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        mpId: 42,
        slug: 'test-mp',
        overallScore: 82,
      });
    });

    it('returns all latest scores when no params are provided', async () => {
      const score = {
        mpId: 1,
        overallScore: 70,
        legislativeActivityScore: 60,
        fiscalResponsibilityScore: 80,
        constituentEngagementScore: 65,
        votingParticipationScore: 75,
        calculatedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      (db.select as jest.Mock).mockReturnValue(
        mockSelectWithJoin([score])
      );

      const request = new NextRequest('http://localhost/api/scores');
      const response = await scoresGET(request);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        count: 1,
        scores: [
          expect.objectContaining({
            mpId: 1,
            overallScore: 70,
          }),
        ],
      });
    });
  });

  describe('/api/mp/[slug]', () => {
    it('returns 400 when slug is missing', async () => {
      const request = new NextRequest('http://localhost/api/mp/');
      const response = await mpGET(request, {
        params: Promise.resolve({ slug: '' }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: 'MP slug is required',
      });
    });

    it('returns 404 when MP is not found', async () => {
      (db.select as jest.Mock).mockReturnValue(
        mockSelectWithLimit([])
      );

      const request = new NextRequest('http://localhost/api/mp/missing');
      const response = await mpGET(request, {
        params: Promise.resolve({ slug: 'missing' }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: 'MP not found',
      });
    });

    it('returns MP data with scores', async () => {
      const mp = {
        id: 10,
        fullName: 'Test MP',
        slug: 'test-mp',
        constituencyName: 'Test Riding',
        province: 'ON',
        caucusShortName: 'Independent',
        email: 'test@example.com',
        phone: '555-0000',
        photoUrl: 'https://example.com/photo.jpg',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      };

      const score = {
        overallScore: 80,
        legislativeActivityScore: 70,
        fiscalResponsibilityScore: 85,
        constituentEngagementScore: 75,
        votingParticipationScore: 90,
        calculatedAt: new Date('2024-01-03T00:00:00.000Z'),
      };

      (db.select as jest.Mock)
        .mockReturnValueOnce(mockSelectWithLimit([mp]))
        .mockReturnValueOnce(mockSelectWithOrderBy([score]));

      const request = new NextRequest('http://localhost/api/mp/test-mp');
      const response = await mpGET(request, {
        params: Promise.resolve({ slug: 'test-mp' }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        mp: expect.objectContaining({
          id: 10,
          fullName: 'Test MP',
          slug: 'test-mp',
        }),
        scores: expect.objectContaining({
          overallScore: 80,
          legislativeActivityScore: 70,
        }),
      });
    });
  });
});
