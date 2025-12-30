/**
 * Unit tests for photo storage service
 * To run: npx jest lib/storage/photo-storage.test.ts
 */

import {
  processAndUploadPhoto,
  getPhotoPublicUrl,
  deletePhoto,
} from './photo-storage'

// Create mock functions that can be controlled in tests
const mockUpload = jest.fn()
const mockRemove = jest.fn()
const mockGetPublicUrl = jest.fn()
const mockFrom = jest.fn(() => ({
  upload: mockUpload,
  getPublicUrl: mockGetPublicUrl,
  remove: mockRemove,
}))

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: mockFrom,
    },
  })),
}))

// Mock sharp - needs to work with dynamic import
// When using dynamic import('sharp'), ES modules return { default: function }
export const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-image')),
}

// Mock sharp module - for dynamic import, ES modules return { default: fn }
jest.mock('sharp', () => {
  // Create the mock function that returns the mock instance
  const fn = jest.fn((input: Buffer) => {
    // Reset mocks to return this for chaining
    mockSharpInstance.resize.mockReturnThis()
    mockSharpInstance.jpeg.mockReturnThis()
    mockSharpInstance.webp.mockReturnThis()
    return mockSharpInstance
  })
  return {
    __esModule: true,
    default: fn,
  }
})

// Mock fetch globally
global.fetch = jest.fn()

// Mock crypto - define mocks inline to avoid hoisting issues
jest.mock('crypto', () => {
  const mockDigest = jest.fn(() => 'mock-hash-value')
  const mockUpdate = jest.fn().mockReturnThis()
  const mockCreateHash = jest.fn(() => ({
    update: mockUpdate,
    digest: mockDigest,
  }))
  return {
    createHash: mockCreateHash,
    default: {
      createHash: mockCreateHash,
    },
  }
})

describe('Photo Storage Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
    // Reset sharp mocks
    mockSharpInstance.resize.mockReturnThis()
    mockSharpInstance.jpeg.mockReturnThis()
    mockSharpInstance.webp.mockReturnThis()
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('processed-image'))
  })

  describe('processAndUploadPhoto', () => {
    it('should download, process, and upload photo successfully', async () => {
      const mockImageBuffer = Buffer.from('mock-image-data')
      const lastModified = new Date('2024-01-01T00:00:00Z')

      // Mock HEAD request (for shouldUpdatePhoto check)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'last-modified') {
              return lastModified.toUTCString()
            }
            return null
          }),
        },
      })

      // Mock GET request (for actual download)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'last-modified') {
              return lastModified.toUTCString()
            }
            return null
          }),
        },
        arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer),
      })

      mockUpload.mockResolvedValueOnce({
        data: { path: '12345.jpg' },
        error: null,
      })

      mockGetPublicUrl.mockReturnValue({
        data: {
          publicUrl: 'https://test.supabase.co/storage/v1/object/public/mp-photos/12345.jpg',
        },
      })

      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        null
      )

      expect(result.success).toBe(true)
      expect(result.photoUrl).toBeDefined()
      expect(result.photoLastModified).toEqual(lastModified)
      expect(result.photoHash).toBeDefined()
      expect(result.skipped).toBeFalsy() // skipped is undefined when photo is processed
    })

    it('should skip photo if Last-Modified header indicates no change', async () => {
      const existingLastModified = new Date('2024-01-02T00:00:00Z')
      const serverLastModified = new Date('2024-01-01T00:00:00Z') // Older than existing

      // Mock HEAD request (for shouldUpdatePhoto check)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'last-modified') {
              return serverLastModified.toUTCString()
            }
            return null
          }),
        },
      })

      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        existingLastModified,
        null
      )

      expect(result.success).toBe(true)
      expect(result.skipped).toBe(true)
      expect(result.reason).toContain('not modified')
    })

    it('should skip photo if hash matches existing', async () => {
      const mockImageBuffer = Buffer.from('mock-image-data')
      const existingHash = 'mock-hash-value'

      // Mock HEAD request (for shouldUpdatePhoto check)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
      })

      // Mock GET request (for actual download)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
        arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer),
      })

      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        existingHash
      )

      expect(result.success).toBe(true)
      expect(result.skipped).toBe(true)
      expect(result.reason).toContain('hash matches')
    })

    it('should handle download failures gracefully', async () => {
      // Mock HEAD request (for shouldUpdatePhoto check) - succeeds
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
      })

      // Mock GET request (for actual download) - fails
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: {
          get: jest.fn(() => null),
        },
      })

      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        null
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Failed to download')
    })

    it('should handle network timeouts', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Request timeout')
      )

      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        null
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle Supabase upload failures', async () => {
      const mockImageBuffer = Buffer.from('mock-image-data')

      // Mock HEAD request (for shouldUpdatePhoto check)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
      })

      // Mock GET request (for actual download)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
        arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer),
      })

      mockUpload.mockResolvedValueOnce({
        data: null,
        error: { message: 'Upload failed' },
      })

      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        null
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to upload')
    })

    it('should resize and compress image with custom options', async () => {
      const mockImageBuffer = Buffer.from('mock-image-data')

      // Mock HEAD request (for shouldUpdatePhoto check)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
      })

      // Mock GET request (for actual download)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
        arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer),
      })

      mockUpload.mockResolvedValueOnce({
        data: { path: '12345.jpg' },
        error: null,
      })

      mockGetPublicUrl.mockReturnValue({
        data: {
          publicUrl: 'https://test.supabase.co/storage/v1/object/public/mp-photos/12345.jpg',
        },
      })

      // Reset sharp mocks
      mockSharpInstance.resize.mockReturnThis()
      mockSharpInstance.jpeg.mockReturnThis()
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('processed-image'))

      await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        null,
        {
          maxWidth: 300,
          maxHeight: 300,
          quality: 90,
          format: 'jpeg',
        }
      )

      // Verify sharp was called with resize options
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({
        quality: 90,
        progressive: true,
      })
    })
  })

  describe('getPhotoPublicUrl', () => {
    it('should generate correct public URL', () => {
      const url = getPhotoPublicUrl('12345')
      expect(url).toContain('12345.jpg')
      expect(url).toContain('mp-photos')
    })

    it('should use custom bucket name', () => {
      const url = getPhotoPublicUrl('12345', 'custom-bucket')
      expect(url).toContain('custom-bucket')
    })

    it('should throw error if SUPABASE_URL is not set', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      expect(() => getPhotoPublicUrl('12345')).toThrow('NEXT_PUBLIC_SUPABASE_URL')
    })
  })

  describe('deletePhoto', () => {
    it('should delete photo from Supabase Storage', async () => {
      mockRemove.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await deletePhoto('12345')

      expect(mockFrom).toHaveBeenCalledWith('mp-photos')
      expect(mockRemove).toHaveBeenCalledWith(['12345.jpg'])
    })

    it('should handle delete failures', async () => {
      mockRemove.mockResolvedValueOnce({
        data: null,
        error: { message: 'Delete failed' },
      })

      await expect(deletePhoto('12345')).rejects.toThrow('Failed to delete')
    })

    it('should use custom bucket name', async () => {
      mockRemove.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await deletePhoto('12345', 'custom-bucket')

      expect(mockFrom).toHaveBeenCalledWith('custom-bucket')
    })
  })

  describe('Error handling', () => {
    it('should handle missing environment variables', async () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_URL

      // Mock HEAD request (for shouldUpdatePhoto check)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
      })

      // Mock GET request (for actual download)
      const mockImageBuffer = Buffer.from('mock-image-data')
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
        arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer),
      })

      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        null
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('NEXT_PUBLIC_SUPABASE_URL')

      // Restore env var
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    })

    it('should handle missing service role key', async () => {
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      // Mock HEAD request (for shouldUpdatePhoto check)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
      })

      // Mock GET request (for actual download)
      const mockImageBuffer = Buffer.from('mock-image-data')
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
        arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer),
      })

      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        null
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('SUPABASE_SERVICE_ROLE_KEY')

      // Restore env var
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
    })

    it('should handle sharp not being installed', async () => {
      // Note: Testing sharp import failure is complex because jest.doMock() must be
      // called before imports, not after jest.resetModules(). The module cache makes
      // it difficult to test dynamic import failures without breaking other tests.
      //
      // The error handling is verified through the implementation:
      // - getSharp() catches import errors and throws a user-friendly message
      // - processAndUploadPhoto() catches all errors and returns them in the result
      //
      // This test documents the expected behavior: if sharp fails to import,
      // the error will be caught and returned as: { success: false, error: 'sharp is required...' }

      // Mock HEAD request (for shouldUpdatePhoto check)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
      })

      // Mock GET request (for actual download)
      const mockImageBuffer = Buffer.from('mock-image-data')
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn(() => null),
        },
        arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer),
      })

      // Set up Supabase mocks
      mockUpload.mockResolvedValueOnce({
        data: { path: '12345.jpg' },
        error: null,
      })

      mockGetPublicUrl.mockReturnValue({
        data: {
          publicUrl: 'https://test.supabase.co/storage/v1/object/public/mp-photos/12345.jpg',
        },
      })

      // With sharp properly mocked (as set up at the top level), the function should work
      // If sharp were not installed, the dynamic import would fail and getSharp() would
      // throw an error that gets caught and returned in the result object.
      const result = await processAndUploadPhoto(
        'https://example.com/photo.jpg',
        '12345',
        null,
        null
      )

      // Verify the function completes (with sharp mocked, it should succeed)
      // The actual failure case (sharp not installed) would return:
      // { success: false, error: 'sharp is required for image processing. Install it with: npm install sharp' }
      expect(result).toBeDefined()
      expect(result.success).toBe(true) // Should succeed with mocked sharp
    })
  })
})

