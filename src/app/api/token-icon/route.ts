import { NextRequest, NextResponse } from 'next/server'

import { getTokenIconBySymbol } from '@/lib/coingecko'

// In-memory cache for server-side
const iconCache = new Map<string, { url: string; timestamp: number }>()
const CACHE_DURATION = 60 * 60 * 24 * 1000 // 24 hours in milliseconds

/**
 * GET /api/token-icon?symbol=BTC
 * Returns the icon URL for a given token symbol
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol parameter is required' },
      { status: 400 }
    )
  }

  const normalizedSymbol = symbol.toLowerCase()

  // Check in-memory cache
  const cached = iconCache.get(normalizedSymbol)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return NextResponse.json(
      { symbol: normalizedSymbol, url: cached.url, cached: true },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    )
  }

  // Fetch from CoinGecko
  try {
    const iconUrl = await getTokenIconBySymbol(normalizedSymbol)

    if (!iconUrl) {
      return NextResponse.json(
        { error: 'Token not found', symbol: normalizedSymbol },
        { status: 404 }
      )
    }

    // Store in cache
    iconCache.set(normalizedSymbol, {
      url: iconUrl,
      timestamp: Date.now(),
    })

    return NextResponse.json(
      { symbol: normalizedSymbol, url: iconUrl, cached: false },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    )
  } catch (error) {
    console.error('Error fetching token icon:', error)
    return NextResponse.json(
      { error: 'Failed to fetch token icon' },
      { status: 500 }
    )
  }
}
