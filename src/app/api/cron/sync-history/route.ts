import { NextRequest, NextResponse } from 'next/server'

import { syncAaveHistory } from '@/lib/protocols/aave'

/**
 * One-time historical APY sync endpoint.
 * Protected by CRON_SECRET. Call with:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/sync-history?protocol=aave
 *
 * Supported protocols: aave (morpho and compound to be added)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const protocol = request.nextUrl.searchParams.get('protocol')

  const startTime = Date.now()

  try {
    let result: { total: number; errors: string[] }

    switch (protocol) {
      case 'aave':
        result = await syncAaveHistory()
        break
      // case 'morpho':
      //   result = await syncMorphoHistory()
      //   break
      // case 'compound':
      //   result = await syncCompoundHistory()
      //   break
      default:
        return NextResponse.json(
          {
            error: `Unknown or missing protocol: ${protocol}. Supported: aave`,
          },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: result.errors.length === 0,
      protocol,
      total: result.total,
      errors: result.errors,
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
