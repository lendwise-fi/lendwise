import { NextRequest, NextResponse } from 'next/server'

// Cache for 1 hour (3600 seconds)
export const revalidate = 3600

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ids = searchParams.get('ids') || 'ethereum'
  const vs_currencies = searchParams.get('vs_currencies') || 'usd'
  const include_24hr_change = searchParams.get('include_24hr_change') || 'true'

  try {
    const coingeckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs_currencies}&include_24hr_change=${include_24hr_change}`

    console.log('Proxying request to:', coingeckoUrl)

    const response = await fetch(coingeckoUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Lendwise/1.0',
      },
      // Cache for 1 hour
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      console.error(
        'CoinGecko API error:',
        response.status,
        response.statusText
      )
      return NextResponse.json(
        { error: `CoinGecko API error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('Proxy response:', data)

    // Return with cache headers
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (error) {
    console.error('Proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch price data' },
      { status: 500 }
    )
  }
}
