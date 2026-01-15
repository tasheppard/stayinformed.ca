/**
 * Photo storage service for MP photos
 * Downloads, resizes, compresses, and uploads MP photos to Supabase Storage
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Lazy load sharp to avoid initialization issues if not installed
let sharpModule: any = null

async function getSharp() {
  if (!sharpModule) {
    try {
      sharpModule = await import('sharp')
    } catch (error) {
      throw new Error(
        'sharp is required for image processing. Install it with: npm install sharp'
      )
    }
  }
  return sharpModule
}

interface PhotoStorageOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  format?: 'jpeg' | 'webp'
}

interface PhotoStorageResult {
  success: boolean
  photoUrl?: string
  photoLastModified?: Date
  photoHash?: string
  error?: string
  skipped?: boolean
  reason?: string
}

/**
 * Create Supabase client for storage operations
 * Uses service role key for server-side operations
 */
function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required')
  }

  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Calculate SHA-256 hash of image buffer
 */
function calculateImageHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Download photo from URL
 */
async function downloadPhoto(url: string): Promise<{ buffer: Buffer; lastModified?: Date }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000), // 30 second timeout
  })

  if (!response.ok) {
    throw new Error(`Failed to download photo: HTTP ${response.status} ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  // Extract Last-Modified header if available
  const lastModifiedHeader = response.headers.get('last-modified')
  const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : undefined

  return { buffer, lastModified }
}

/**
 * Resize and compress image
 */
async function processImage(
  inputBuffer: Buffer,
  options: PhotoStorageOptions = {}
): Promise<Buffer> {
  const sharpModule = await getSharp()

  const {
    maxWidth = 400,
    maxHeight = 400,
    quality = 85,
    format = 'jpeg',
  } = options

  // When using dynamic import('sharp'), handle both ES module and CommonJS formats
  // ES modules: { default: function } or the module itself might be callable
  // CommonJS: the module itself is the function
  let sharpFn: any
  
  // First check if it's directly a function (CommonJS)
  if (typeof sharpModule === 'function') {
    sharpFn = sharpModule
  }
  // Check for ES module default export
  else if (sharpModule && typeof (sharpModule as any).default === 'function') {
    sharpFn = (sharpModule as any).default
  }
  // Check if the module object itself has a callable property
  else if (sharpModule && typeof sharpModule === 'object') {
    // Try default first, then the module itself
    const possibleFn = (sharpModule as any).default || sharpModule
    if (typeof possibleFn === 'function') {
      sharpFn = possibleFn
    }
  }
  
  // Final validation
  if (typeof sharpFn !== 'function') {
    const moduleType = typeof sharpModule
    const moduleKeys = sharpModule && typeof sharpModule === 'object' ? Object.keys(sharpModule) : []
    throw new Error(
      `sharp function is not callable. Module type: ${moduleType}, keys: ${moduleKeys.join(', ')}, default type: ${sharpModule && typeof (sharpModule as any).default}`
    )
  }

  let image = sharpFn(inputBuffer)

  // Resize while maintaining aspect ratio
  image = image.resize(maxWidth, maxHeight, {
    fit: 'inside',
    withoutEnlargement: true,
  })

  // Convert to JPEG and compress
  if (format === 'jpeg') {
    image = image.jpeg({ quality, progressive: true })
  } else {
    image = image.webp({ quality })
  }

  return await image.toBuffer()
}

/**
 * Upload photo to Supabase Storage
 */
async function uploadToSupabase(
  buffer: Buffer,
  personId: string,
  bucketName: string = 'mp-photos'
): Promise<string> {
  const supabase = createSupabaseClient()
  const fileName = `${personId}.jpg`
  const filePath = fileName

  // Upload file
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, buffer, {
      contentType: 'image/jpeg',
      upsert: true, // Overwrite if exists
      cacheControl: '3600', // Cache for 1 hour
    })

  if (error) {
    throw new Error(`Failed to upload photo to Supabase: ${error.message}`)
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucketName).getPublicUrl(filePath)

  return publicUrl
}

/**
 * Check if photo needs to be updated
 * Compares Last-Modified header or image hash with database values
 */
async function shouldUpdatePhoto(
  photoUrl: string,
  existingPhotoLastModified?: Date | null,
  existingPhotoHash?: string | null
): Promise<{ shouldUpdate: boolean; reason?: string; lastModified?: Date; hash?: string }> {
  try {
    // Fetch photo headers only (HEAD request)
    const response = await fetch(photoUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    if (!response.ok) {
      // If HEAD fails, we'll try to download anyway
      return { shouldUpdate: true, reason: 'HEAD request failed, will download to check' }
    }

    const lastModifiedHeader = response.headers.get('last-modified')
    const etag = response.headers.get('etag')

    // If we have Last-Modified header, compare with database
    if (lastModifiedHeader && existingPhotoLastModified) {
      const serverLastModified = new Date(lastModifiedHeader)
      if (serverLastModified <= existingPhotoLastModified) {
        return {
          shouldUpdate: false,
          reason: 'Photo not modified (Last-Modified header)',
          lastModified: serverLastModified,
        }
      }
    }

    // If we have ETag and hash, compare
    if (etag && existingPhotoHash) {
      // ETag might be wrapped in quotes, remove them
      const cleanEtag = etag.replace(/^"|"$/g, '')
      if (cleanEtag === existingPhotoHash) {
        return {
          shouldUpdate: false,
          reason: 'Photo not modified (ETag matches hash)',
          hash: cleanEtag,
          // Also include lastModified if available from HEAD response
          lastModified: lastModifiedHeader ? new Date(lastModifiedHeader) : undefined,
        }
      }
    }

    // If no existing data, we should update
    if (!existingPhotoLastModified && !existingPhotoHash) {
      return { shouldUpdate: true, reason: 'No existing photo data' }
    }

    // Default to updating if we can't determine
    return { shouldUpdate: true, reason: 'Unable to determine if photo changed' }
  } catch (error) {
    // If HEAD request fails, we'll download and check hash
    return { shouldUpdate: true, reason: 'HEAD request failed, will download to verify' }
  }
}

/**
 * Process and upload MP photo
 * Downloads photo, checks if it needs updating, resizes/compresses, and uploads to Supabase
 */
export async function processAndUploadPhoto(
  photoUrl: string,
  personId: string,
  existingPhotoLastModified?: Date | null,
  existingPhotoHash?: string | null,
  options: PhotoStorageOptions = {}
): Promise<PhotoStorageResult> {
  try {
    // Check if photo needs updating
    const updateCheck = await shouldUpdatePhoto(
      photoUrl,
      existingPhotoLastModified,
      existingPhotoHash
    )

    if (!updateCheck.shouldUpdate) {
      return {
        success: true,
        skipped: true,
        reason: updateCheck.reason,
        photoLastModified: updateCheck.lastModified,
        photoHash: updateCheck.hash,
      }
    }

    // Download photo
    const { buffer: originalBuffer, lastModified } = await downloadPhoto(photoUrl)

    // Calculate hash of original image
    const photoHash = calculateImageHash(originalBuffer)

    // If hash matches existing, skip processing
    if (existingPhotoHash && photoHash === existingPhotoHash) {
      return {
        success: true,
        skipped: true,
        reason: 'Photo hash matches existing (no changes)',
        photoHash,
        photoLastModified: lastModified,
      }
    }

    // Process image (resize and compress)
    const processedBuffer = await processImage(originalBuffer, options)

    // Upload to Supabase Storage
    const uploadedUrl = await uploadToSupabase(processedBuffer, personId)

    return {
      success: true,
      photoUrl: uploadedUrl,
      photoLastModified: lastModified || new Date(),
      photoHash,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Get public URL for MP photo from Supabase Storage
 */
export function getPhotoPublicUrl(personId: string, bucketName: string = 'mp-photos'): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required')
  }

  const fileName = `${personId}.jpg`
  return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${fileName}`
}

/**
 * Delete photo from Supabase Storage
 */
export async function deletePhoto(
  personId: string,
  bucketName: string = 'mp-photos'
): Promise<void> {
  const supabase = createSupabaseClient()
  const fileName = `${personId}.jpg`

  const { error } = await supabase.storage.from(bucketName).remove([fileName])

  if (error) {
    throw new Error(`Failed to delete photo: ${error.message}`)
  }
}

