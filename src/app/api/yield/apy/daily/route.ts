import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_SPOT,
  getDb,
} from '@/lib/db/mongodb'
import type {
  ApyDaily,
  ApySpot,
  BorrowApyDaily,
  BorrowDailyMarketState,
  Distribution,
  LendApyDaily,
  LendDailyMarketState,
} from '@/lib/db/types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Expected number of 10-min slots in a full day: 6/hour × 24 = 144 */
const EXPECTED_SLOTS = 144

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(
  completeness: number
): 'complete' | 'partial' | 'missing' {
  if (completeness >= 1) return 'complete'
  if (completeness >= 0.5) return 'partial'
  return 'missing'
}

function buildDistribution(values: number[]): Distribution {
  if (values.length === 0) {
    return { avg: 0, min: 0, max: 0, p25: 0, p75: 0, stdDev: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const p25 = sorted[Math.floor(sorted.length * 0.25)]
  const p75 = sorted[Math.floor(sorted.length * 0.75)]
  const stdDev = Math.sqrt(
    values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length
  )

  return { avg, min, max, p25, p75, stdDev }
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Aggregate all spot documents for a single poolId over a 24h window
 * into a single ApyDaily document.
 *
 * Two-pass strategy:
 *   Pass 1 — statistical distributions (avg/min/max/p25/p75/stdDev) for APY and rates
 *   Pass 2 — closing values (last slot of the day) for volume fields
 */
async function aggregatePool(
  poolId: string,
  windowStart: Date,
  windowEnd: Date,
  computedAt: Date
): Promise<ApyDaily | null> {
  const db = await getDb()
  const collection = db.collection<ApySpot>(MONGODB_COLLECTION_SPOT)

  // ─── Pass 1: fetch all slots ───────────────────────────────────────────────
  const slots = await collection
    .find(
      {
        'meta.poolId': poolId,
        timestamp: { $gte: windowStart, $lt: windowEnd },
      },
      {
        projection: {
          timestamp: 1,
          meta: 1,
          'apy.base': 1,
          'apy.net': 1,
          'apy.rewards': 1,
          'apy.fees': 1,
          'market.supplyAssetsUsd': 1,
          'market.borrowAssetsUsd': 1,
          'market.availableLiquidity': 1,
          'market.utilizationRate': 1,
          'market.assetPriceUsd': 1,
          'market.collateralAssetsUsd': 1,
          'market.priceCollateralInLoanAsset': 1,
        },
      }
    )
    .sort({ timestamp: 1 })
    .toArray()

  if (slots.length === 0) return null

  const meta = slots[0].meta
  const actualCount = slots.length
  const completeness = actualCount / EXPECTED_SLOTS

  // ─── Statistical distributions ─────────────────────────────────────────────
  const baseValues = slots.map((s) => s.apy.base)
  const netValues = slots.map((s) => s.apy.net)
  const avgRewards = slots.reduce((s, d) => s + d.apy.rewards, 0) / actualCount
  const avgFees = slots.reduce((s, d) => s + d.apy.fees, 0) / actualCount
  const utilizationValues = slots.map((s) => s.market.utilizationRate)
  const priceValues = slots.map((s) => s.market.assetPriceUsd)

  // ─── Pass 2: closing values (last slot) ───────────────────────────────────
  const closing = slots[slots.length - 1]

  // ─── Build document ───────────────────────────────────────────────────────
  const quality = {
    actualCount,
    completeness,
    status: computeStatus(completeness),
    revision: 1,
    computedAt,
  }

  if (meta.kind === 'lend') {
    const market: LendDailyMarketState = {
      supplyAssetsUsd: closing.market.supplyAssetsUsd,
      availableLiquidity: closing.market.availableLiquidity,
      utilizationRate: buildDistribution(utilizationValues),
      assetPriceUsd: buildDistribution(priceValues),
    }

    const doc: LendApyDaily = {
      date: windowStart,
      poolId,
      meta: {
        kind: 'lend',
        protocol: meta.protocol,
        chain: meta.chain,
        asset: meta.asset,
      },
      apy: {
        base: buildDistribution(baseValues),
        net: buildDistribution(netValues),
        rewards: avgRewards,
        fees: avgFees,
      },
      market,
      quality,
    }

    return doc
  }

  // kind === 'borrow'
  const borrowClosing = closing.market as {
    borrowAssetsUsd: number
    supplyAssetsUsd: number
    availableLiquidity: number
    utilizationRate: number
    assetPriceUsd: number
    collateralAssetsUsd: number | null
    priceCollateralInLoanAsset: number | null
  }

  // priceCollateralInLoanAsset distribution — only if at least one slot has a value
  const priceCollateralValues = slots
    .map((s) => (s.market as typeof borrowClosing).priceCollateralInLoanAsset)
    .filter((v): v is number => v != null)

  const market: BorrowDailyMarketState = {
    supplyAssetsUsd: borrowClosing.supplyAssetsUsd,
    borrowAssetsUsd: borrowClosing.borrowAssetsUsd,
    availableLiquidity: borrowClosing.availableLiquidity,
    collateralAssetsUsd: borrowClosing.collateralAssetsUsd,
    utilizationRate: buildDistribution(utilizationValues),
    assetPriceUsd: buildDistribution(priceValues),
    priceCollateralInLoanAsset:
      priceCollateralValues.length > 0
        ? buildDistribution(priceCollateralValues)
        : null,
  }

  const doc: BorrowApyDaily = {
    date: windowStart,
    poolId,
    meta: {
      kind: 'borrow',
      protocol: meta.protocol,
      chain: meta.chain,
      asset: meta.asset,
    },
    apy: {
      base: buildDistribution(baseValues),
      net: buildDistribution(netValues),
      rewards: avgRewards,
      fees: avgFees,
    },
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
    { poolId: doc.poolId, date: doc.date },
    {
      $set: { ...doc },
      $inc: { 'quality.revision': 0 }, // no-op on insert
      $setOnInsert: { 'quality.revision': 1 },
    },
    { upsert: true }
  )
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

/**
 * Daily APY aggregation endpoint.
 *
 * Triggered by QStash at 00:10 UTC.
 * Reads all apy.spot documents from [D-1 00:00Z, D 00:00Z[
 * and produces one ApyDaily document per active poolId.
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

    // Discover all poolIds active in this window
    const spotCollection = db.collection<ApySpot>(MONGODB_COLLECTION_SPOT)
    const poolIds: string[] = await spotCollection.distinct('meta.poolId', {
      timestamp: { $gte: windowStart, $lt: windowEnd },
    })

    if (poolIds.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: 'No spot data found for the window',
          counts: { total: 0 },
        },
        { status: 200 }
      )
    }

    // Aggregate each pool independently — allows partial success
    const results = await Promise.allSettled(
      poolIds.map((poolId) =>
        aggregatePool(poolId, windowStart, windowEnd, computedAt)
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
        errors.push(`[${poolIds[i]}] ${msg}`)
        console.error(`[cron:apy-daily] Failed for pool ${poolIds[i]}:`, msg)
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
          total: poolIds.length,
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
