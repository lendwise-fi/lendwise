import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import {
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_PRODUCTS,
  getDb,
} from '@/lib/db/mongodb'
import type { ApySlot, Product } from '@/lib/db/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GapReport {
  /** Hour boundary that has no hourly doc for this product. */
  hour: string
  productId: string
}

interface IncompleteReport {
  /** Hour boundary where quality.count < 6. */
  hour: string
  productId: string
  count: number
}

interface GapDetectionResult {
  success: boolean
  window: string
  /** Total active products discovered from the products collection. */
  activeProducts: number
  /** Total hour × product slots expected in the window. */
  expectedSlots: number
  /** Slots actually found in apy.hourly. */
  foundSlots: number
  /** Completely missing slots (no hourly doc at all). */
  missingSlots: number
  /** Slots with quality.count < 6 (incomplete hour). */
  incompleteSlots: number
  /** Number of stale hourly docs marked as 'partial' (R3). */
  markedStale: number
  /** Up to 50 missing gaps for debugging. */
  gaps: GapReport[]
  /** Up to 50 incomplete slots for debugging. */
  incomplete: IncompleteReport[]
  durationMs: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate all hour boundaries in [windowStart, windowEnd[.
 */
function generateHourBoundaries(windowStart: Date, windowEnd: Date): Date[] {
  const hours: Date[] = []
  const current = new Date(windowStart)
  while (current < windowEnd) {
    hours.push(new Date(current))
    current.setUTCHours(current.getUTCHours() + 1)
  }
  return hours
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

/**
 * Gap detection endpoint for the APY pipeline.
 *
 * Triggered by QStash daily at 01:00 UTC (after the daily aggregation at 00:10).
 * Scans apy.hourly for the previous 24h window and reports:
 *   - Missing hourly docs (no doc for a given productId × hour)
 *   - Incomplete hourly docs (quality.count < 6)
 *
 * Also marks past hourly docs with count < 6 as quality.status = 'partial' (R3).
 *
 * Body (JSON, optional):
 *   hours (number): How many hours to scan back. Default: 24.
 */
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  const start = Date.now()

  try {
    const body = await req.json().catch(() => ({}))
    const lookbackHours = Math.min(
      Math.max(body.hours ?? 24, 1),
      168 // max 7 days
    )

    const db = await getDb()

    // ─── Window ────────────────────────────────────────────────────────────
    const now = new Date()
    // End at the current hour boundary (exclusive)
    const windowEnd = new Date(now)
    windowEnd.setUTCMinutes(0, 0, 0)

    const windowStart = new Date(windowEnd)
    windowStart.setUTCHours(windowStart.getUTCHours() - lookbackHours)

    const hourBoundaries = generateHourBoundaries(windowStart, windowEnd)

    // ─── Discover active products ──────────────────────────────────────────
    // Use products collection to know the full set of expected productIds
    const productsCollection = db.collection<Product>(
      MONGODB_COLLECTION_PRODUCTS
    )
    const activeProductIds: string[] = await productsCollection
      .find({ active: true }, { projection: { _id: 1 } })
      .map((p) => p._id)
      .toArray()

    if (activeProductIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active products found',
        durationMs: Date.now() - start,
      })
    }

    // ─── Fetch existing hourly docs ────────────────────────────────────────
    const hourlyCollection = db.collection<ApySlot>(MONGODB_COLLECTION_HOURLY)

    // Get all (productId, hour, quality.count) tuples in the window
    const existingDocs = await hourlyCollection
      .find(
        {
          hour: { $gte: windowStart, $lt: windowEnd },
          productId: { $in: activeProductIds },
        },
        {
          projection: {
            productId: 1,
            hour: 1,
            'quality.count': 1,
            'quality.status': 1,
          },
        }
      )
      .toArray()

    // Build a lookup: "productId|hourISO" → { count, status }
    const existingMap = new Map<string, { count: number; status: string }>()
    for (const doc of existingDocs) {
      const key = `${doc.productId}|${doc.hour.toISOString()}`
      existingMap.set(key, {
        count: doc.quality?.count ?? 0,
        status: doc.quality?.status ?? 'building',
      })
    }

    // ─── Detect gaps and incomplete slots ──────────────────────────────────────
    const gaps: GapReport[] = []
    const incomplete: IncompleteReport[] = []
    let missingCount = 0
    let incompleteCount = 0

    const expectedSlots = activeProductIds.length * hourBoundaries.length

    for (const hour of hourBoundaries) {
      const hourISO = hour.toISOString()
      for (const productId of activeProductIds) {
        const key = `${productId}|${hourISO}`
        const entry = existingMap.get(key)

        if (!entry) {
          missingCount++
          if (gaps.length < 50) {
            gaps.push({ hour: hourISO, productId })
          }
        } else if (entry.count < 6) {
          incompleteCount++
          if (incomplete.length < 50) {
            incomplete.push({
              hour: hourISO,
              productId,
              count: entry.count,
            })
          }
        }
      }
    }

    // ─── R3: Mark stale hourly docs ────────────────────────────────────────
    // Past hours (before current hour) with count < 6 should be 'partial'
    const staleResult = await hourlyCollection.updateMany(
      {
        hour: { $gte: windowStart, $lt: windowEnd },
        'quality.count': { $lt: 6 },
        'quality.status': 'building',
      },
      {
        $set: { 'quality.status': 'partial' },
      }
    )

    const markedStale = staleResult.modifiedCount

    // ─── Logging ───────────────────────────────────────────────────────────
    const durationMs = Date.now() - start
    const windowStr = `${windowStart.toISOString()} → ${windowEnd.toISOString()}`

    if (missingCount > 0 || incompleteCount > 0) {
      console.warn(
        `[cron:gap-detect] ⚠️ Gaps found — window: ${windowStr}` +
          ` missing: ${missingCount} incomplete: ${incompleteCount}` +
          ` markedStale: ${markedStale}` +
          ` (${activeProductIds.length} products × ${hourBoundaries.length}h = ${expectedSlots} expected)`
      )
    } else {
      console.log(
        `[cron:gap-detect] ✅ No gaps — window: ${windowStr}` +
          ` ${existingDocs.length}/${expectedSlots} slots OK` +
          ` markedStale: ${markedStale}`
      )
    }

    const result: GapDetectionResult = {
      success: true,
      window: windowStr,
      activeProducts: activeProductIds.length,
      expectedSlots,
      foundSlots: existingDocs.length,
      missingSlots: missingCount,
      incompleteSlots: incompleteCount,
      markedStale,
      gaps,
      incomplete,
      durationMs,
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron:gap-detect] Failed:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
})
