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
  /** Products that have at least 1 hourly doc in the window — the "collected" set. */
  collectedProducts: number
  /** Products active in `products` but with zero hourly docs in the window. */
  neverIndexedCount: number
  /**
   * Operational metrics — computed only over collected products.
   * These are the numbers suitable for alerting.
   */
  collected: {
    expectedSlots: number
    foundSlots: number
    missingSlots: number
    incompleteSlots: number
  }
  /** Number of stale hourly docs marked as 'partial' (R3). */
  markedStale: number
  /** Up to 50 missing gaps (collected products only) for debugging. */
  gaps: GapReport[]
  /** Up to 50 incomplete slots for debugging. */
  incomplete: IncompleteReport[]
  /** Up to 50 never-indexed productIds for investigation. */
  neverIndexed: string[]
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

    // ─── Partition: collected vs never-indexed ────────────────────────────────
    // A product is "collected" if it has at least 1 hourly doc in the window.
    const collectedProductIds = new Set<string>()
    for (const doc of existingDocs) {
      collectedProductIds.add(doc.productId)
    }

    const neverIndexed: string[] = []
    for (const id of activeProductIds) {
      if (!collectedProductIds.has(id)) {
        if (neverIndexed.length < 50) neverIndexed.push(id)
      }
    }
    const neverIndexedCount = activeProductIds.length - collectedProductIds.size

    // ─── Detect gaps and incomplete slots (collected products only) ──────────
    const gaps: GapReport[] = []
    const incomplete: IncompleteReport[] = []
    let missingCount = 0
    let incompleteCount = 0
    let foundCollectedSlots = 0

    const collectedExpected = collectedProductIds.size * hourBoundaries.length

    for (const hour of hourBoundaries) {
      const hourISO = hour.toISOString()
      for (const productId of collectedProductIds) {
        const key = `${productId}|${hourISO}`
        const entry = existingMap.get(key)

        if (!entry) {
          missingCount++
          if (gaps.length < 50) {
            gaps.push({ hour: hourISO, productId })
          }
        } else if (entry.count < 6) {
          incompleteCount++
          foundCollectedSlots++
          if (incomplete.length < 50) {
            incomplete.push({
              hour: hourISO,
              productId,
              count: entry.count,
            })
          }
        } else {
          foundCollectedSlots++
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
        `[cron:gap-detect] ⚠️ Gaps in collected products — window: ${windowStr}` +
          ` missing: ${missingCount} incomplete: ${incompleteCount}` +
          ` markedStale: ${markedStale}` +
          ` (${collectedProductIds.size} collected × ${hourBoundaries.length}h = ${collectedExpected} expected)` +
          ` neverIndexed: ${neverIndexedCount}`
      )
    } else {
      console.log(
        `[cron:gap-detect] ✅ No gaps — window: ${windowStr}` +
          ` ${foundCollectedSlots}/${collectedExpected} collected slots OK` +
          ` markedStale: ${markedStale}` +
          ` neverIndexed: ${neverIndexedCount}`
      )
    }

    const result: GapDetectionResult = {
      success: true,
      window: windowStr,
      activeProducts: activeProductIds.length,
      collectedProducts: collectedProductIds.size,
      neverIndexedCount,
      collected: {
        expectedSlots: collectedExpected,
        foundSlots: foundCollectedSlots,
        missingSlots: missingCount,
        incompleteSlots: incompleteCount,
      },
      markedStale,
      gaps,
      incomplete,
      neverIndexed,
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
