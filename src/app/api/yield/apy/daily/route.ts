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
  SupplyApyDaily,
  SupplyMarketState,
} from '@/lib/db/types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Expected number of hourly documents in a full day: 24 */
const EXPECTED_SLOTS = 24

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

function computeStatus(
  completeness: number
): 'complete' | 'partial' | 'missing' {
  if (completeness >= 1) return 'complete'
  if (completeness >= 0.5) return 'partial'
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
  const actualCount = hours.length
  const completeness = actualCount / EXPECTED_SLOTS

  const quality = {
    actualCount,
    completeness,
    status: computeStatus(completeness),
    revision: 1,
    computedAt,
  }

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

  await collection.updateOne(
    { productId: doc.productId, date: doc.date },
    {
      $set: { ...doc },
      $setOnInsert: { 'quality.revision': 1 },
      $inc: { 'quality.revision': 0 },
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

    // Aggregate each product independently — allows partial success
    const results = await Promise.allSettled(
      productIds.map((productId) =>
        aggregatePool(productId, windowStart, windowEnd, computedAt)
      )
    )

    let written = 0
    let skipped = 0
    const errors: string[] = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled') {
        if (result.value) {
          await upsertDailyDoc(result.value)
          written++
        } else {
          skipped++
        }
      } else {
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
        errors.push(`[${productIds[i]}] ${msg}`)
        console.error(
          `[cron:apy-daily] Failed for product ${productIds[i]}:`,
          msg
        )
      }
    }

    const window = `${windowStart.toISOString()} → ${windowEnd.toISOString()}`
    console.log(
      `[cron:apy-daily] Completed — window: ${window}` +
        ` written: ${written} skipped: ${skipped} errors: ${errors.length}`
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
