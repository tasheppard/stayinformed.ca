import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { findMPByCoordinates, postalCodeToCoordinates } from '@/lib/utils/geolocation'

/**
 * GET /api/geolocation
 * 
 * Query parameters:
 * - lat: latitude (required if no postalCode)
 * - lng: longitude (required if no postalCode)
 * - postalCode: Canadian postal code (alternative to lat/lng)
 * 
 * Returns MP information for the given location
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const postalCode = searchParams.get('postalCode')
    const cacheTtlSeconds = 60 * 60 * 24 * 7

    const getCoordinatesByPostalCode = (code: string) =>
      unstable_cache(
        async () => {
          return postalCodeToCoordinates(code)
        },
        ['geolocation', 'postal', code.toLowerCase()],
        {
          revalidate: cacheTtlSeconds,
          tags: ['geolocation', `geolocation:postal:${code.toLowerCase()}`],
        }
      )()

    const getMpByCoordinates = (latitude: number, longitude: number) =>
      unstable_cache(
        async () => {
          return findMPByCoordinates(latitude, longitude)
        },
        ['geolocation', 'coords', String(latitude), String(longitude)],
        {
          revalidate: cacheTtlSeconds,
          tags: [
            'geolocation',
            `geolocation:coords:${latitude},${longitude}`,
          ],
        }
      )()

    // Validate input - must have either lat/lng or postalCode
    if (!postalCode && (!lat || !lng)) {
      return NextResponse.json(
        { error: 'Either lat/lng or postalCode must be provided' },
        { status: 400 }
      )
    }

    let latitude: number
    let longitude: number

    // If postal code provided, convert to coordinates
    if (postalCode) {
      try {
        const coords = await getCoordinatesByPostalCode(postalCode)
        latitude = coords.latitude
        longitude = coords.longitude
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'Failed to convert postal code to coordinates',
          },
          { status: 400 }
        )
      }
    } else {
      // Parse lat/lng from query params
      latitude = parseFloat(lat!)
      longitude = parseFloat(lng!)

      if (isNaN(latitude) || isNaN(longitude)) {
        return NextResponse.json(
          { error: 'Invalid latitude or longitude values' },
          { status: 400 }
        )
      }
    }

    // Find MP by coordinates
    const result = await getMpByCoordinates(latitude, longitude)

    if (!result) {
      return NextResponse.json(
        { error: 'No MP found for the given location' },
        { status: 404 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in geolocation API:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

