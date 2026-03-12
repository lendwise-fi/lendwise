import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import { collectApySpot } from '@/app/actions/apy-snapshots.actions'
import { ProtocolName, getProtocolIds } from '@/config/protocols'
import type {
  BorrowApyTimeSeriesDocument,
  LendApyTimeSeriesDocument,
} from '@/lib/db/types'

/**
 * Spot APY snapshot endpoint.
 *
 * Persists two document shapes into the same Atlas MongoDB collection (spot):
 * - Lend: LendApyTimeSeriesDocument (kind='lend') — metadata.vault, supplyApy, supplyAssets; no borrowApy.
 * - Borrow: BorrowApyTimeSeriesDocument (kind='borrow') — metadata.market, supplyApy, borrowApy, supply/borrow/collateral amounts.
 *
 * Body (JSON):
 * - protocol (required): e.g. 'aave_v3', 'morpho_v1', 'compound_v3'
 *
 * Triggered by QStash or Vercel cron.
 */
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}))
  const protocol = body.protocol as string | undefined

  if (!protocol) {
    return NextResponse.json(
      { error: 'Missing required parameter: protocol' },
      { status: 400 }
    )
  }

  // Validate protocol
  // Strict matching only (e.g. 'aave_v3')
  const validIds = getProtocolIds() as string[]

  if (!validIds.includes(protocol)) {
    return NextResponse.json(
      {
        error: `Invalid protocol: ${protocol}. Supported: ${validIds.join(', ')}`,
      },
      { status: 400 }
    )
  }

  try {
    const result = await collectApySpot(protocol as ProtocolName)

    return NextResponse.json(result, {
      status: result.success ? 200 : 207,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      `[cron:collect-apy] Unhandled error for protocol ${protocol}:`,
      message
    )

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
})
