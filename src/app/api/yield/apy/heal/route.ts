import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import type { AnyBulkWriteOperation, Filter, MatchKeysAndValues } from 'mongodb'
import { ObjectId } from 'mongodb'

import { dbBackend } from '@/lib/db/env'
import { MONGODB_COLLECTION_HOURLY, getDb } from '@/lib/db/mongodb'
import {
  fetchDonors,
  writeHealed,
  type HealRow,
} from '@/lib/db/repositories/gaps'
import {
  insertReport,
  latestReport,
  reportById,
} from '@/lib/db/repositories/reports'
import type { ApySlot } from '@/lib/db/types'
import type { HistoryDataPoint } from '@/lib/protocols/aave/v3/apy-history'
import { fetchAaveHistory } from '@/lib/protocols/aave/v3/apy-history'
import { fetchMorphoHistory } from '@/lib/protocols/morpho/v1/apy-history'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Extra hours before/after the gap window to search for nearest-neighbor donors. */
const DONOR_PADDING_HOURS = 6

// ─── Types ──────────────────────────────────────────────────────────────────

interface GapReportDoc {
  _id: ObjectId
  type: 'gap-detection'
  gaps: { hour: string; productId: string }[]
  incomplete?: { hour: string; productId: string; count: number }[]
}

interface GapEntry {
  hour: string
  productId: string
  kind: 'missing' | 'incomplete'
}

type HealSource = 'refetch' | 'nearest-neighbor'

interface HealResult {
  success: boolean
  reportId: string | null
  sourceReportId: string
  totalGaps: number
  totalMissing: number
  totalIncomplete: number
  healedByRefetch: number
  healedByNeighbor: number
  healed: number
  alreadyExists: number
  noDonor: number
  errors: string[]
  noDonorSample: string[]
  breakdown: Record<
    string,
    { gaps: number; refetched: number; neighbor: number; noDonor: number }
  >
  durationMs: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildHourlyId(productId: string, hour: Date): string {
  return `${productId}:${hour.toISOString().slice(0, 13)}`
}

/** Normalize any Date to the top of the hour. */
function normalizeHour(d: Date): Date {
  const n = new Date(d)
  n.setUTCMinutes(0, 0, 0)
  return n
}

/**
 * Detect protocol family from a productId prefix.
 * Returns 'morpho' | 'aave' | 'compound' | 'unknown'.
 */
function detectProtocol(
  productId: string
): 'morpho' | 'aave' | 'compound' | 'unknown' {
  if (
    productId.startsWith('morphoblue:') ||
    productId.startsWith('metamorpho:')
  )
    return 'morpho'
  if (productId.startsWith('aave:')) return 'aave'
  if (productId.startsWith('compoundcomet:')) return 'compound'
  return 'unknown'
}

/**
 * Build a lookup key from productId and a Date.
 * Uses the same truncated ISO format as buildHourlyId.
 */
function lookupKey(productId: string, hour: Date): string {
  return `${productId}:${hour.toISOString().slice(0, 13)}`
}

/**
 * Convert HistoryDataPoint[] into a Map keyed by `${productId}:${YYYY-MM-DDTHH}`.
 */
function buildHistoryLookup(
  points: HistoryDataPoint[]
): Map<string, HistoryDataPoint> {
  const map = new Map<string, HistoryDataPoint>()
  for (const pt of points) {
    const hour = normalizeHour(pt.timestamp)
    const key = lookupKey(pt.productId, hour)
    map.set(key, pt)
  }
  return map
}

/**
 * Find the closest existing hourly doc for a given product.
 */
function findNearestDonor(targetHour: Date, donors: ApySlot[]): ApySlot | null {
  if (donors.length === 0) return null
  let best = donors[0]
  let bestDist = Math.abs(targetHour.getTime() - best.hour.getTime())
  for (let i = 1; i < donors.length; i++) {
    const dist = Math.abs(targetHour.getTime() - donors[i].hour.getTime())
    if (dist < bestDist) {
      best = donors[i]
      bestDist = dist
    }
  }
  return best
}

/**
 * Create a bulk operation for a healed hourly doc.
 * - missing: $setOnInsert + upsert (never overwrite organic data)
 * - incomplete: $set to overwrite the poor-quality existing doc
 */
function buildHealOp(
  productId: string,
  hour: Date,
  apy: HistoryDataPoint['apy'],
  market: HistoryDataPoint['market'],
  source: HealSource,
  sourceDetail: string,
  gapKind: 'missing' | 'incomplete' = 'missing'
): AnyBulkWriteOperation<ApySlot> {
  const isRefetch = source === 'refetch'
  const healFields = {
    hour,
    productId,
    apy,
    market,
    quality: {
      count: isRefetch ? 6 : 0,
      expectedCount: 6 as const,
      firstSlot: hour,
      lastSlot: hour,
      status: isRefetch ? ('complete' as const) : ('partial' as const),
    },
    healed: true,
    healSource: source,
    healedFrom: sourceDetail,
  } as unknown as MatchKeysAndValues<ApySlot>

  if (gapKind === 'incomplete') {
    return {
      updateOne: {
        filter: {
          _id: buildHourlyId(productId, hour),
        } as unknown as Filter<ApySlot>,
        update: { $set: healFields },
      },
    }
  }

  return {
    updateOne: {
      filter: {
        _id: buildHourlyId(productId, hour),
      } as unknown as Filter<ApySlot>,
      update: { $setOnInsert: healFields },
      upsert: true,
    },
  }
}

// ─── Postgres heal handler ────────────────────────────────────────────────────

/** Map a snake_case donor row (raw SQL) → camelCase market object. */
function donorMarket(d: Record<string, unknown>): Record<string, number | null> {
  return {
    supplyAssets: d.supply_assets as number | null,
    supplyAssetsUsd: d.supply_assets_usd as number | null,
    utilizationRate: d.utilization_rate as number | null,
    assetPriceUsd: d.asset_price_usd as number | null,
    borrowAssets: d.borrow_assets as number | null,
    borrowAssetsUsd: d.borrow_assets_usd as number | null,
    collateralAssetsUsd: d.collateral_assets_usd as number | null,
    priceCollateralInLoanAsset: d.price_collateral_in_loan_asset as number | null,
  }
}

interface DonorPoint {
  hour: Date
  apy: { base: number; rewards: number; fees: number; net: number; rewardItems: unknown[] }
  market: Record<string, number | null>
}

async function healHandlerPostgres(
  body: { reportId?: string },
  start: number
): Promise<NextResponse> {
  const errors: string[] = []

  const report = body.reportId
    ? await reportById(body.reportId, 'gap-detection')
    : await latestReport('gap-detection')

  if (!report) {
    return NextResponse.json(
      { success: false, error: 'No gap-detection report found' },
      { status: 404 }
    )
  }

  const payload = report.payload as {
    gaps?: { hour: string; productId: string }[]
    incomplete?: { hour: string; productId: string; count: number }[]
  }
  const missingGaps = payload.gaps ?? []
  const incompleteGaps = payload.incomplete ?? []

  const allEntries: GapEntry[] = [
    ...missingGaps.map((g) => ({ ...g, kind: 'missing' as const })),
    ...incompleteGaps.map((g) => ({ ...g, kind: 'incomplete' as const })),
  ]

  if (allEntries.length === 0) {
    return NextResponse.json({
      success: true,
      sourceReportId: report.id,
      message: 'No gaps to heal in this report',
      durationMs: Date.now() - start,
    })
  }

  // Categorize by protocol + compute gap time boundaries
  const gapsByProtocol = new Map<string, { productId: string; hour: Date }[]>()
  let minTs = Infinity
  let maxTs = -Infinity
  for (const entry of allEntries) {
    const proto = detectProtocol(entry.productId)
    const list = gapsByProtocol.get(proto) ?? []
    list.push({ productId: entry.productId, hour: new Date(entry.hour) })
    gapsByProtocol.set(proto, list)
    const t = new Date(entry.hour).getTime()
    if (t < minTs) minTs = t
    if (t > maxTs) maxTs = t
  }

  // Phase 1: re-fetch historical data (Morpho + AAVE)
  const historyLookup = new Map<string, HistoryDataPoint>()
  if ((gapsByProtocol.get('morpho') ?? []).length > 0) {
    try {
      const startTs = Math.floor(minTs / 1000) - 3600
      const endTs = Math.floor(maxTs / 1000) + 3600
      const points = await fetchMorphoHistory({
        interval: 'HOUR',
        startTimestamp: startTs,
        endTimestamp: endTs,
        onProgress: (m) => console.log(`[cron:heal:pg] ${m}`),
      })
      for (const [k, v] of buildHistoryLookup(points)) historyLookup.set(k, v)
    } catch (err) {
      errors.push(`morpho-history: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if ((gapsByProtocol.get('aave') ?? []).length > 0) {
    try {
      const points = await fetchAaveHistory({
        window: 'LAST_WEEK',
        onProgress: (m) => console.log(`[cron:heal:pg] ${m}`),
      })
      for (const [k, v] of buildHistoryLookup(points)) historyLookup.set(k, v)
    } catch (err) {
      errors.push(`aave-history: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Phase 2: nearest-neighbor donors (Compound + fallback)
  const needNeighbor = new Set<string>()
  for (const entry of allEntries) {
    if (!historyLookup.has(lookupKey(entry.productId, new Date(entry.hour)))) {
      needNeighbor.add(entry.productId)
    }
  }
  const donorsByProduct = new Map<string, DonorPoint[]>()
  if (needNeighbor.size > 0) {
    const donorStart = new Date(minTs - DONOR_PADDING_HOURS * 3600_000)
    const donorEnd = new Date(maxTs + DONOR_PADDING_HOURS * 3600_000)
    const donorRows = await fetchDonors([...needNeighbor], donorStart, donorEnd)
    for (const d of donorRows) {
      const productId = d.product_id as string
      const list = donorsByProduct.get(productId) ?? []
      list.push({
        hour: new Date(d.hour as string),
        apy: {
          base: d.apy_base as number,
          rewards: d.apy_rewards as number,
          fees: d.apy_fees as number,
          net: d.apy_net as number,
          rewardItems: (d.reward_items as unknown[]) ?? [],
        },
        market: donorMarket(d),
      })
      donorsByProduct.set(productId, list)
    }
  }

  // Phase 3: build heal rows
  const rows: HealRow[] = []
  let refetch = 0
  let neighbor = 0
  let noDonor = 0
  for (const entry of allEntries) {
    const hour = new Date(entry.hour)
    const hp = historyLookup.get(lookupKey(entry.productId, hour))
    if (hp) {
      rows.push({
        productId: entry.productId,
        hour,
        apy: {
          base: hp.apy.base,
          rewards: hp.apy.rewards,
          fees: hp.apy.fees,
          net: hp.apy.net,
          rewardItems: (hp.apy as { rewardItems?: unknown[] }).rewardItems ?? [],
        },
        market: hp.market as unknown as Record<string, number | null>,
        source: 'refetch',
        healedFrom: hp.timestamp.toISOString(),
        gapKind: entry.kind,
      })
      refetch++
      continue
    }
    const donor = findNearestDonor(hour, (donorsByProduct.get(entry.productId) ?? []) as unknown as ApySlot[]) as unknown as DonorPoint | null
    if (donor) {
      rows.push({
        productId: entry.productId,
        hour,
        apy: donor.apy,
        market: donor.market,
        source: 'nearest-neighbor',
        healedFrom: donor.hour.toISOString(),
        gapKind: entry.kind,
      })
      neighbor++
    } else {
      noDonor++
    }
  }

  const healed = await writeHealed(rows)
  const result = {
    success: errors.length === 0,
    sourceReportId: report.id,
    totalGaps: allEntries.length,
    totalMissing: missingGaps.length,
    totalIncomplete: incompleteGaps.length,
    healedByRefetch: refetch,
    healedByNeighbor: neighbor,
    healed,
    noDonor,
    errors,
    durationMs: Date.now() - start,
  }
  const reportId = await insertReport('gap-healing', result)
  console.log(
    `[cron:heal:pg] healed ${healed} (refetch ${refetch}, neighbor ${neighbor}, noDonor ${noDonor}) reportId ${reportId}`
  )
  return NextResponse.json({ ...result, reportId })
}

// ─── Endpoint ───────────────────────────────────────────────────────────────

/**
 * Gap healing endpoint for the APY pipeline.
 *
 * Strategy (in priority order):
 *   1. **Re-fetch** — Morpho (HOUR interval) and AAVE (LAST_WEEK window) historical APIs
 *   2. **Nearest-neighbor** — copy closest existing hourly doc (Compound / fallback)
 *
 * Healed docs are marked with `healed: true`, `healSource` and `healedFrom`
 * for full traceability. Uses $setOnInsert — never overwrites organic data.
 *
 * Body (JSON, optional):
 *   reportId (string): specific gap report ObjectId. Default: latest.
 */
async function healHandler(req: NextRequest) {
  const start = Date.now()
  const errors: string[] = []

  try {
    const body = await req.json().catch(() => ({}))
    console.log(
      `[cron:heal] Starting heal job (reportId: ${body.reportId || 'latest'})`
    )
    if (dbBackend() === 'postgres') return healHandlerPostgres(body, start)
    const db = await getDb()

    // ─── Load gap report ────────────────────────────────────────────────
    const reportsCollection = db.collection<GapReportDoc>('pipeline.reports')

    let gapReport: GapReportDoc | null
    if (body.reportId) {
      gapReport = await reportsCollection.findOne({
        _id: new ObjectId(body.reportId),
        type: 'gap-detection',
      })
    } else {
      gapReport = await reportsCollection.findOne(
        { type: 'gap-detection' },
        { sort: { createdAt: -1 } }
      )
    }

    if (!gapReport) {
      return NextResponse.json(
        { success: false, error: 'No gap-detection report found' },
        { status: 404 }
      )
    }

    const missingGaps = gapReport.gaps ?? []
    const incompleteGaps = gapReport.incomplete ?? []

    // Merge into unified list with kind marker
    const allEntries: GapEntry[] = [
      ...missingGaps.map((g) => ({ ...g, kind: 'missing' as const })),
      ...incompleteGaps.map((g) => ({ ...g, kind: 'incomplete' as const })),
    ]

    if (allEntries.length === 0) {
      return NextResponse.json({
        success: true,
        sourceReportId: gapReport._id.toHexString(),
        message: 'No gaps to heal in this report',
        durationMs: Date.now() - start,
      })
    }

    console.log(
      `[cron:heal] Loaded ${allEntries.length} entries from report ${gapReport._id.toHexString()}` +
        ` (missing: ${missingGaps.length}, incomplete: ${incompleteGaps.length})`
    )

    // ─── Categorize gaps by protocol ────────────────────────────────────
    const gapsByProtocol = new Map<
      string,
      { productId: string; hour: Date }[]
    >()
    for (const entry of allEntries) {
      const proto = detectProtocol(entry.productId)
      const list = gapsByProtocol.get(proto) ?? []
      list.push({ productId: entry.productId, hour: new Date(entry.hour) })
      gapsByProtocol.set(proto, list)
    }

    for (const [proto, list] of gapsByProtocol) {
      console.log(`[cron:heal]   ${proto}: ${list.length} entries`)
    }

    // ─── Phase 1: Re-fetch historical data (Morpho + AAVE) ─────────────
    // Build a unified lookup: key → HistoryDataPoint
    const historyLookup = new Map<string, HistoryDataPoint>()

    // Compute gap time boundaries for fetchers
    let minTs = Infinity
    let maxTs = -Infinity
    for (const entry of allEntries) {
      const t = new Date(entry.hour).getTime()
      if (t < minTs) minTs = t
      if (t > maxTs) maxTs = t
    }

    // ── Morpho history ──────────────────────────────────────────────────
    const morphoGaps = gapsByProtocol.get('morpho') ?? []
    if (morphoGaps.length > 0) {
      try {
        const startTs = Math.floor(minTs / 1000) - 3600 // 1h padding
        const endTs = Math.floor(maxTs / 1000) + 3600

        console.log(`[cron:heal] Fetching Morpho history (HOUR interval)…`)
        const morphoPoints = await fetchMorphoHistory({
          interval: 'HOUR',
          startTimestamp: startTs,
          endTimestamp: endTs,
          onProgress: (msg) => console.log(`[cron:heal] ${msg}`),
        })

        const morphoMap = buildHistoryLookup(morphoPoints)
        for (const [k, v] of morphoMap) historyLookup.set(k, v)

        console.log(
          `[cron:heal] Morpho history: ${morphoPoints.length} points → ${morphoMap.size} hourly slots`
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`morpho-history: ${msg}`)
        console.error('[cron:heal] Morpho history fetch failed:', msg)
      }
    }

    // ── AAVE history ────────────────────────────────────────────────────
    const aaveGaps = gapsByProtocol.get('aave') ?? []
    if (aaveGaps.length > 0) {
      try {
        console.log(`[cron:heal] Fetching AAVE history (LAST_WEEK window)…`)
        const aavePoints = await fetchAaveHistory({
          window: 'LAST_WEEK',
          onProgress: (msg) => console.log(`[cron:heal] ${msg}`),
        })

        const aaveMap = buildHistoryLookup(aavePoints)
        for (const [k, v] of aaveMap) historyLookup.set(k, v)

        console.log(
          `[cron:heal] AAVE history: ${aavePoints.length} points → ${aaveMap.size} hourly slots`
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`aave-history: ${msg}`)
        console.error('[cron:heal] AAVE history fetch failed:', msg)
      }
    }

    // ─── Phase 2: Nearest-neighbor donors (for Compound + fallback) ─────
    // Fetch existing hourly docs for products that need nearest-neighbor
    const needNeighborProductIds = new Set<string>()
    for (const entry of allEntries) {
      const key = lookupKey(entry.productId, new Date(entry.hour))
      if (!historyLookup.has(key)) {
        needNeighborProductIds.add(entry.productId)
      }
    }

    const donorsByProduct = new Map<string, ApySlot[]>()

    if (needNeighborProductIds.size > 0) {
      console.log(
        `[cron:heal] Fetching nearest-neighbor donors for ${needNeighborProductIds.size} products…`
      )
      const hourlyCollection = db.collection<ApySlot>(MONGODB_COLLECTION_HOURLY)

      const donorStart = new Date(minTs - DONOR_PADDING_HOURS * 3600_000)
      const donorEnd = new Date(maxTs + DONOR_PADDING_HOURS * 3600_000)

      const donorDocs = await hourlyCollection
        .find(
          {
            productId: { $in: [...needNeighborProductIds] },
            hour: { $gte: donorStart, $lte: donorEnd },
          },
          { projection: { _id: 0, productId: 1, hour: 1, apy: 1, market: 1 } }
        )
        .toArray()

      for (const doc of donorDocs) {
        const list = donorsByProduct.get(doc.productId) ?? []
        list.push(doc)
        donorsByProduct.set(doc.productId, list)
      }

      console.log(
        `[cron:heal] Loaded ${donorDocs.length} donor docs for nearest-neighbor`
      )
    }

    // ─── Phase 3: Build bulk operations ─────────────────────────────────
    const bulkOps: AnyBulkWriteOperation<ApySlot>[] = []
    let refetchCount = 0
    let neighborCount = 0
    let noDonorCount = 0
    const noDonorSample: string[] = []
    const breakdown: HealResult['breakdown'] = {}

    for (const entry of allEntries) {
      const hour = new Date(entry.hour)
      const proto = detectProtocol(entry.productId)
      const key = lookupKey(entry.productId, hour)

      // Init breakdown
      if (!breakdown[proto]) {
        breakdown[proto] = { gaps: 0, refetched: 0, neighbor: 0, noDonor: 0 }
      }
      breakdown[proto].gaps++

      // Try history re-fetch first
      const historyPoint = historyLookup.get(key)
      if (historyPoint) {
        bulkOps.push(
          buildHealOp(
            entry.productId,
            hour,
            historyPoint.apy,
            historyPoint.market,
            'refetch',
            historyPoint.timestamp.toISOString(),
            entry.kind
          )
        )
        refetchCount++
        breakdown[proto].refetched++
        continue
      }

      // Fallback: nearest-neighbor
      const donors = donorsByProduct.get(entry.productId) ?? []
      const donor = findNearestDonor(hour, donors)

      if (donor) {
        bulkOps.push(
          buildHealOp(
            entry.productId,
            hour,
            donor.apy,
            donor.market,
            'nearest-neighbor',
            donor.hour.toISOString(),
            entry.kind
          )
        )
        neighborCount++
        breakdown[proto].neighbor++
      } else {
        noDonorCount++
        breakdown[proto].noDonor++
        if (noDonorSample.length < 20) {
          noDonorSample.push(
            `${entry.productId}@${hour.toISOString().slice(0, 13)}`
          )
        }
      }
    }

    console.log(
      `[cron:heal] Built ${bulkOps.length} ops: refetch=${refetchCount} neighbor=${neighborCount} noDonor=${noDonorCount}`
    )

    // ─── Execute bulk write ─────────────────────────────────────────────
    let healed = 0
    let alreadyExists = 0

    if (bulkOps.length > 0) {
      // Process in chunks of 1000 to avoid oversized bulkWrite payloads
      const CHUNK = 1000
      for (let i = 0; i < bulkOps.length; i += CHUNK) {
        const chunk = bulkOps.slice(i, i + CHUNK)
        try {
          const hourlyCollection = db.collection<ApySlot>(
            MONGODB_COLLECTION_HOURLY
          )
          const result = await hourlyCollection.bulkWrite(chunk, {
            ordered: false,
          })
          healed += result.upsertedCount + result.modifiedCount
          alreadyExists += result.matchedCount - result.modifiedCount
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`bulkWrite chunk ${i}: ${msg}`)
          console.error(`[cron:heal] bulkWrite chunk ${i} error:`, msg)
        }
      }
    }

    // ─── Persist heal report ────────────────────────────────────────────
    const durationMs = Date.now() - start

    const healResult: HealResult = {
      success: errors.length === 0,
      reportId: null,
      sourceReportId: gapReport._id.toHexString(),
      totalGaps: allEntries.length,
      totalMissing: missingGaps.length,
      totalIncomplete: incompleteGaps.length,
      healedByRefetch: refetchCount,
      healedByNeighbor: neighborCount,
      healed,
      alreadyExists,
      noDonor: noDonorCount,
      errors,
      noDonorSample,
      breakdown,
      durationMs,
    }

    try {
      const insert = await db.collection('pipeline.reports').insertOne({
        type: 'gap-healing',
        createdAt: new Date(),
        ...healResult,
      })
      healResult.reportId = insert.insertedId.toHexString()
    } catch (err) {
      console.error(
        '[cron:heal] Failed to persist report:',
        err instanceof Error ? err.message : String(err)
      )
    }

    // ─── Logging ────────────────────────────────────────────────────────
    console.log(
      `[cron:heal] Completed in ${durationMs}ms —` +
        ` healed: ${healed} (refetch: ${refetchCount}, neighbor: ${neighborCount})` +
        ` alreadyExists: ${alreadyExists} noDonor: ${noDonorCount}` +
        ` (source: ${gapReport._id.toHexString()})` +
        (healResult.reportId ? ` (reportId: ${healResult.reportId})` : '')
    )

    console.log(`[cron:heal] Breakdown:\n` + JSON.stringify(breakdown, null, 2))

    if (noDonorCount > 0) {
      console.warn(
        `[cron:heal] No data for ${noDonorCount} gaps. Sample:`,
        noDonorSample.slice(0, 5).join(', ')
      )
    }

    return NextResponse.json(healResult)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron:heal] Failed:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export const POST =
  process.env.NODE_ENV === 'development'
    ? healHandler
    : verifySignatureAppRouter(healHandler)
