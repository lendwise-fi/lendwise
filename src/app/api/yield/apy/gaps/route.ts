import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import {
  collectedProductCount,
  findGaps,
  findIncomplete,
  markStale,
} from '@/lib/db/repositories/gaps'
import { insertReport } from '@/lib/db/repositories/reports'

/**
 * Gap detection endpoint for the APY pipeline.
 *
 * Triggered by QStash daily at 01:00 UTC (after the daily aggregation at 00:10).
 * Over the previous 7-day window it reports, via set-based SQL:
 *   - Missing hourly rows (no row for a collected productId × hour)
 *   - Incomplete hourly rows (quality_count < 6, not healed)
 * and marks stale 'building' rows as 'partial'. Persists a full report to
 * pipeline_reports for the heal job; the JSON response is capped at 50 entries.
 *
 * Body (JSON, optional): hours (number) — lookback. Default 168 (7 days), max 336.
 */
async function gapsHandler(req: NextRequest) {
  const start = Date.now()

  try {
    const body = await req.json().catch(() => ({}))
    const lookbackHours = Math.min(Math.max(body.hours ?? 168, 1), 336)

    const now = new Date()
    const windowEnd = new Date(now)
    windowEnd.setUTCMinutes(0, 0, 0)
    const windowStart = new Date(windowEnd)
    windowStart.setUTCHours(windowStart.getUTCHours() - lookbackHours)

    const [gaps, incomplete, markedStale, collectedProducts] =
      await Promise.all([
        findGaps(windowStart, windowEnd),
        findIncomplete(windowStart, windowEnd),
        markStale(windowStart, windowEnd),
        collectedProductCount(windowStart, windowEnd),
      ])

    const windowStr = `${windowStart.toISOString()} → ${windowEnd.toISOString()}`
    const summary = {
      success: true,
      window: windowStr,
      collected: {
        expectedSlots: collectedProducts * lookbackHours,
        missingSlots: gaps.length,
        incompleteSlots: incomplete.length,
      },
      markedStale,
      gaps: gaps
        .slice(0, 50)
        .map((g) => ({ hour: g.hour.toISOString(), productId: g.productId })),
      incomplete: incomplete.slice(0, 50).map((i) => ({
        hour: i.hour.toISOString(),
        productId: i.productId,
        count: i.count,
      })),
    }

    // Persist the FULL lists for the heal job; response stays capped at 50.
    const reportId = await insertReport('gap-detection', {
      ...summary,
      gaps: gaps.map((g) => ({
        hour: g.hour.toISOString(),
        productId: g.productId,
      })),
      incomplete: incomplete.map((i) => ({
        hour: i.hour.toISOString(),
        productId: i.productId,
        count: i.count,
      })),
    })

    console.log(
      `[cron:gap-detect] ${windowStr} missing: ${gaps.length}` +
        ` incomplete: ${incomplete.length} markedStale: ${markedStale}` +
        ` (reportId: ${reportId}) durationMs: ${Date.now() - start}`
    )

    return NextResponse.json({ ...summary, reportId })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron:gap-detect] Failed:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export const POST =
  process.env.NODE_ENV === 'development'
    ? gapsHandler
    : verifySignatureAppRouter(gapsHandler)
