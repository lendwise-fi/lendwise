import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import { aggregateDaily } from '@/lib/db/repositories/apy'
import { pruneHourly } from '@/lib/db/repositories/gaps'

/**
 * Daily APY aggregation endpoint.
 *
 * Triggered by QStash at 00:10 UTC. Aggregates apy_hourly over the window
 * [D-1 00:00Z, D 00:00Z) into apy_daily — one row per product, in a single
 * set-based statement — then prunes hourly rows older than 180 days.
 *
 * Idempotent — reruns on the same day replace the rows and bump quality_revision.
 */
export const POST = verifySignatureAppRouter(async (_req: NextRequest) => {
  const computedAt = new Date()

  try {
    // Explicit window — never relative to now()
    const windowEnd = new Date(computedAt)
    windowEnd.setUTCHours(0, 0, 0, 0)

    const windowStart = new Date(windowEnd)
    windowStart.setUTCDate(windowStart.getUTCDate() - 1)

    const written = await aggregateDaily(windowStart, windowEnd, computedAt)
    const pruned = await pruneHourly()
    const window = `${windowStart.toISOString()} → ${windowEnd.toISOString()}`

    console.log(
      `[cron:apy-daily] Completed — window: ${window} written: ${written} pruned: ${pruned}`
    )

    return NextResponse.json(
      { success: true, counts: { written, pruned }, window },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron:apy-daily] Aggregation failed:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
})
