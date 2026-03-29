import { NextRequest, NextResponse } from 'next/server'

import { fetchAaveHistory } from '@/lib/protocols/aave'
import { fetchCompoundDailyHistory } from '@/lib/protocols/compound'
import { fetchMorphoHistory } from '@/lib/protocols/morpho'

/**
 * One-time historical APY sync endpoint.
 * Protected by CRON_SECRET. Call with:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/sync-history?protocol=aave
 *
 * Supported protocols: aave, morpho, compound
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const protocol = request.nextUrl.searchParams.get('protocol')

  const startTime = Date.now()

  try {
    let total = 0
    const errors: string[] = []

    switch (protocol) {
      case 'aave': {
        const points = await fetchAaveHistory()
        total = points.length
        break
      }
      case 'morpho': {
        const points = await fetchMorphoHistory()
        total = points.length
        break
      }
      case 'compound': {
        const points = await fetchCompoundDailyHistory()
        total = points.length
        break
      }
      default:
        return NextResponse.json(
          {
            error: `Unknown or missing protocol: ${protocol}. Supported: aave, morpho, compound`,
          },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: errors.length === 0,
      protocol,
      total,
      errors,
      durationMs: Date.now() - startTime,
    })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        protocol,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
