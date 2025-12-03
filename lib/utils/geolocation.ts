import postgres from 'postgres'
import { db } from '../db'
import { mps, ridingBoundaries } from '../db/schema'
import { eq, and } from 'drizzle-orm'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Direct postgres client for raw SQL queries (PostGIS functions)
// Using connection pooling - postgres client manages connections automatically
const sqlClient = postgres(process.env.DATABASE_URL, {
  max: 1, // Limit connections for serverless environments
})

export interface GeolocationResult {
  mp: {
    id: number
    fullName: string
    slug: string
    constituencyName: string
    province: string
    caucusShortName: string | null
    email: string | null
    phone: string | null
    photoUrl: string | null
  }
  riding: {
    id: number
    ridingName: string
    province: string
  }
}

/**
 * Find the MP for a given latitude and longitude using PostGIS ST_Contains
 * @param latitude - Latitude in decimal degrees (WGS84)
 * @param longitude - Longitude in decimal degrees (WGS84)
 * @returns MP and riding information, or null if not found
 */
export async function findMPByCoordinates(
  latitude: number,
  longitude: number
): Promise<GeolocationResult | null> {
  // Validate coordinates
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Invalid coordinates provided')
  }

  try {
    // Use PostGIS ST_Contains to find which riding boundary contains the point
    // ST_SetSRID creates a point geometry with SRID 4326 (WGS84)
    // ST_Contains checks if the geometry contains the point
    const result = await sqlClient`
      SELECT 
        rb.id as riding_id,
        rb.riding_name,
        rb.province as riding_province
      FROM riding_boundaries rb
      WHERE ST_Contains(
        rb.geom::geometry,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      )
      LIMIT 1
    `

    if (result.length === 0) {
      return null
    }

    const riding = result[0]

    // Find the MP for this riding
    // Match by constituency name and province
    const mp = await db
      .select()
      .from(mps)
      .where(
        and(
          eq(mps.constituencyName, riding.riding_name),
          eq(mps.province, riding.riding_province)
        )
      )
      .limit(1)

    if (mp.length === 0) {
      // Riding found but no MP assigned yet
      return null
    }

    return {
      mp: {
        id: mp[0].id,
        fullName: mp[0].fullName,
        slug: mp[0].slug,
        constituencyName: mp[0].constituencyName,
        province: mp[0].province,
        caucusShortName: mp[0].caucusShortName,
        email: mp[0].email,
        phone: mp[0].phone,
        photoUrl: mp[0].photoUrl,
      },
      riding: {
        id: riding.riding_id,
        ridingName: riding.riding_name,
        province: riding.riding_province,
      },
    }
  } catch (error) {
    console.error('Error finding MP by coordinates:', error)
    throw new Error('Failed to find MP by coordinates')
  }
}

/**
 * Convert postal code to coordinates using Mapbox Geocoding API
 * @param postalCode - Canadian postal code (e.g., "K1A 0A6")
 * @returns Coordinates object with latitude and longitude
 */
export async function postalCodeToCoordinates(
  postalCode: string
): Promise<{ latitude: number; longitude: number }> {
  // Clean postal code (remove spaces, convert to uppercase)
  const cleaned = postalCode.replace(/\s+/g, '').toUpperCase()

  // Validate Canadian postal code format (A1A 1A1)
  const postalCodeRegex = /^[A-Z]\d[A-Z]\d[A-Z]\d$/
  if (!postalCodeRegex.test(cleaned)) {
    throw new Error('Invalid Canadian postal code format')
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  if (!mapboxToken) {
    throw new Error('Mapbox access token not configured')
  }

  try {
    // Mapbox Geocoding API - search for postal code in Canada
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        cleaned
      )}.json?country=CA&access_token=${mapboxToken}`
    )

    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.features || data.features.length === 0) {
      throw new Error('Postal code not found')
    }

    // Get the first result's coordinates
    const [longitude, latitude] = data.features[0].geometry.coordinates

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Invalid coordinates returned from Mapbox')
    }

    return { latitude, longitude }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to convert postal code to coordinates')
  }
}

