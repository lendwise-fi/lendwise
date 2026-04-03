import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  getDb,
} from '@/lib/db/mongodb'
import type {
  ApyDaily,
  ApySlot,
  BorrowApyDaily,
  BorrowMarketState,
  DailyQuality,
  DailyQualityStatus,
  SupplyApyDaily,
  SupplyMarketState,
} from '@/lib/db/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

const EXPECTED_HOURLY_COUNT = 24

function computeDailyQualityStatus(actualCount: number): DailyQualityStatus {
  if (actualCount >= EXPECTED_HOURLY_COUNT) return 'complete'
  if (actualCount >= EXPECTED_HOURLY_COUNT / 2) return 'partial'
  return 'missing'
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Aggregate all hourly documents for a single productId over a 24h window
 * into a single ApyDaily document.
 *
 * All numeric fields are averaged across the 24 hourly slots.
 * rewardItems comes from the last slot.
 */
async function aggregatePool(
  productId: string,
  windowStart: Date,
  windowEnd: Date,
  computedAt: Date
): Promise<ApyDaily | null> {
  const db = await getDb()
  const collection = db.collection<ApySlot>(MONGODB_COLLECTION_HOURLY)

  const hours = await collection
    .find(
      {
        productId,
        hour: { $gte: windowStart, $lt: windowEnd },
      },
      {
        projection: {
          'apy.base': 1,
          'apy.net': 1,
          'apy.rewards': 1,
          'apy.fees': 1,
          'apy.rewardItems': 1,
          'market.supplyAssets': 1,
          'market.supplyAssetsUsd': 1,
          'market.borrowAssets': 1,
          'market.borrowAssetsUsd': 1,
          'market.utilizationRate': 1,
          'market.assetPriceUsd': 1,
          'market.collateralAssetsUsd': 1,
          'market.priceCollateralInLoanAsset': 1,
        },
      }
    )
    .sort({ hour: 1 })
    .toArray()

  if (hours.length === 0) return null

  const lastSlot = hours[hours.length - 1]

  const apy = {
    base: avg(hours.map((h) => h.apy.base)),
    net: avg(hours.map((h) => h.apy.net)),
    rewards: avg(hours.map((h) => h.apy.rewards)),
    fees: avg(hours.map((h) => h.apy.fees)),
    rewardItems: lastSlot.apy.rewardItems,
  }

  // Detect borrow vs supply by checking if any hourly doc has borrowAssets
  const isBorrow = hours.some(
    (h) => (h.market as BorrowMarketState).borrowAssets != null
  )

  if (!isBorrow) {
    const market: SupplyMarketState = {
      supplyAssets: avg(hours.map((h) => h.market.supplyAssets)),
      supplyAssetsUsd: avg(hours.map((h) => h.market.supplyAssetsUsd)),
      utilizationRate: avg(hours.map((h) => h.market.utilizationRate)),
      assetPriceUsd: avg(hours.map((h) => h.market.assetPriceUsd)),
    }

    const quality: DailyQuality = {
      actualCount: hours.length,
      expectedCount: EXPECTED_HOURLY_COUNT,
      completeness: Math.min(hours.length / EXPECTED_HOURLY_COUNT, 1),
      status: computeDailyQualityStatus(hours.length),
      revision: 0, // will be incremented by $inc in upsert
      computedAt,
    }

    const doc: SupplyApyDaily = {
      date: windowStart,
      productId,
      apy,
      market,
      quality,
    }

    return doc
  }

  // Borrow product
  const borrowHours = hours.map((h) => h.market as BorrowMarketState)

  const collateralValues = borrowHours
    .map((m) => m.collateralAssetsUsd)
    .filter((v): v is number => v != null)

  const priceCollateralValues = borrowHours
    .map((m) => m.priceCollateralInLoanAsset)
    .filter((v): v is number => v != null)

  const market: BorrowMarketState = {
    supplyAssets: avg(borrowHours.map((m) => m.supplyAssets)),
    supplyAssetsUsd: avg(borrowHours.map((m) => m.supplyAssetsUsd)),
    borrowAssets: avg(borrowHours.map((m) => m.borrowAssets)),
    borrowAssetsUsd: avg(borrowHours.map((m) => m.borrowAssetsUsd)),
    utilizationRate: avg(borrowHours.map((m) => m.utilizationRate)),
    assetPriceUsd: avg(borrowHours.map((m) => m.assetPriceUsd)),
    collateralAssetsUsd:
      collateralValues.length > 0 ? avg(collateralValues) : null,
    priceCollateralInLoanAsset:
      priceCollateralValues.length > 0 ? avg(priceCollateralValues) : null,
  }

  const quality: DailyQuality = {
    actualCount: hours.length,
    expectedCount: EXPECTED_HOURLY_COUNT,
    completeness: Math.min(hours.length / EXPECTED_HOURLY_COUNT, 1),
    status: computeDailyQualityStatus(hours.length),
    revision: 0,
    computedAt,
  }

  const doc: BorrowApyDaily = {
    date: windowStart,
    productId,
    apy,
    market,
    quality,
  }

  return doc
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

async function upsertDailyDoc(doc: ApyDaily): Promise<void> {
  const db = await getDb()
  const collection = db.collection<ApyDaily>(MONGODB_COLLECTION_DAILY)

  // Separate revision from the rest so $inc handles it atomically
  const { quality, ...rest } = doc
  const { revision: _revision, ...qualityWithoutRevision } = quality

  await collection.updateOne(
    { productId: doc.productId, date: doc.date },
    {
      $set: { ...rest, ...qualityWithoutRevision },
      $inc: { 'quality.revision': 1 },
    },
    { upsert: true }
  )
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

/**
 * Daily APY aggregation endpoint.
 *
 * Triggered by QStash at 00:10 UTC.
 * Reads all apy.hourly documents from [D-1 00:00Z, D 00:00Z[
 * and produces one ApyDaily document per active productId.
 *
 * Idempotent — reruns on the same day replace the existing document
 * and increment quality.revision.
 */
export const POST = verifySignatureAppRouter(async (_req: NextRequest) => {
  const computedAt = new Date()

  try {
    const db = await getDb()

    // Explicit window — never relative to now()
    const windowEnd = new Date(computedAt)
    windowEnd.setUTCHours(0, 0, 0, 0)

    const windowStart = new Date(windowEnd)
    windowStart.setUTCDate(windowStart.getUTCDate() - 1)

    // Discover all productIds active in this window
    const hourlyCollection = db.collection<ApySlot>(MONGODB_COLLECTION_HOURLY)
    const productIds: string[] = await hourlyCollection
      .aggregate<{ _id: string }>([
        {
          $match: {
            hour: { $gte: windowStart, $lt: windowEnd },
            productId: { $ne: null },
          },
        },
        { $group: { _id: '$productId' } },
      ])
      .map((d) => d._id)
      .toArray()

    if (productIds.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: 'No hourly data found for the window',
          counts: { total: 0 },
        },
        { status: 200 }
      )
    }

    // Process products sequentially to avoid OOM on serverless functions
    let written = 0
    let skipped = 0
    const errors: string[] = []

    for (const productId of productIds) {
      try {
        const doc = await aggregatePool(
          productId,
          windowStart,
          windowEnd,
          computedAt
        )
        if (doc) {
          await upsertDailyDoc(doc)
          written++
        } else {
          skipped++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`[${productId}] ${msg}`)
        console.error(`[cron:apy-daily] Failed for product ${productId}:`, msg)
      }
    }

    const window = `${windowStart.toISOString()} → ${windowEnd.toISOString()}`
    console.log(
      `[cron:apy-daily] Completed — window: ${window}` +
        ` written: ${written} skipped: ${skipped} errors: ${errors.length}` +
        ` products: ${productIds.length}`
    )

    return NextResponse.json(
      {
        success: errors.length === 0,
        counts: {
          total: productIds.length,
          written,
          skipped,
          errors: errors.length,
        },
        window,
        errors,
      },
      { status: errors.length === 0 ? 200 : 207 }
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
