import type { Version } from '@blend-capital/blend-sdk'

import { getBigQueryClient } from '@/lib/bigquery/client'
import type { ApyBreakdown } from '@/lib/db/types'
import { requestedProducts } from '@/lib/protocols/core/history-result'
import type {
  HistoryDataPoint,
  HistoryFailure,
  HistoryParams,
  HistoryResult,
  HistoryTarget,
} from '@/lib/protocols/core/types'
import {
  type HubbleHistoryBucket,
  fetchStellarHubbleHistory,
  historyFailure,
  unknownBorrowMarket,
  unknownSupplyMarket,
} from '@/lib/protocols/stellar/hubble-history'
import { aprToApyDaily } from '@/lib/utils'

import { BLEND_PROVIDER } from './config'

interface BlendReserveHistoryState {
  supplyApr: number
  borrowApr: number
  supplyAssets: number | null
  borrowAssets: number | null
  utilizationRate: number | null
}

interface BlendHistoryOpts {
  version: Version
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function firstNumber(
  obj: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const n = asNumber(obj[key])
    if (n != null) return n
  }
  return null
}

function containsAsset(value: unknown, assetId: string): boolean {
  const assetLower = assetId.toLowerCase()
  if (typeof value === 'string') return value.toLowerCase() === assetLower
  if (Array.isArray(value)) {
    return value.some((item) => containsAsset(item, assetId))
  }
  const obj = asRecord(value)
  if (!obj) return false
  return Object.entries(obj).some(
    ([key, child]) =>
      key.toLowerCase() === assetLower || containsAsset(child, assetId)
  )
}

function findReserveNode(
  value: unknown,
  assetId: string
): Record<string, unknown> | null {
  const assetLower = assetId.toLowerCase()
  const visit = (node: unknown): Record<string, unknown> | null => {
    const obj = asRecord(node)
    if (obj) {
      const address =
        obj.assetId ?? obj.asset_id ?? obj.asset ?? obj.token ?? obj.address
      if (typeof address === 'string' && address.toLowerCase() === assetLower) {
        return obj
      }
      for (const [key, child] of Object.entries(obj)) {
        if (key.toLowerCase() === assetLower) {
          const childObj = asRecord(child)
          if (childObj) return childObj
        }
        const found = visit(child)
        if (found) return found
      }
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = visit(child)
        if (found) return found
      }
    }
    return null
  }
  return visit(value)
}

export function decodeBlendReserveHistoryState(
  bucket: HubbleHistoryBucket,
  assetId: string
): BlendReserveHistoryState | null {
  for (const entry of bucket.ledgerEntries) {
    const reserve = containsAsset(entry.key_decoded, assetId)
      ? asRecord(entry.val_decoded)
      : findReserveNode(entry.val_decoded, assetId)
    if (!reserve) continue

    const supplyApr = firstNumber(reserve, [
      'supplyApr',
      'supply_apr',
      'supplyAPR',
      'supply_rate',
      'supplyRate',
    ])
    const borrowApr = firstNumber(reserve, [
      'borrowApr',
      'borrow_apr',
      'borrowAPR',
      'borrow_rate',
      'borrowRate',
    ])
    if (supplyApr == null || borrowApr == null) continue

    const supplyAssets = firstNumber(reserve, [
      'supplyAssets',
      'supply_assets',
      'totalSupply',
      'total_supply',
      'bSupplyUnderlying',
      'b_supply_underlying',
    ])
    const borrowAssets = firstNumber(reserve, [
      'borrowAssets',
      'borrow_assets',
      'totalBorrow',
      'total_borrow',
      'totalLiabilities',
      'dSupplyUnderlying',
      'd_supply_underlying',
    ])
    const utilizationRate =
      firstNumber(reserve, [
        'utilizationRate',
        'utilization_rate',
        'utilization',
      ]) ??
      (supplyAssets && borrowAssets != null
        ? borrowAssets / supplyAssets
        : null)

    return {
      supplyApr,
      borrowApr,
      supplyAssets,
      borrowAssets,
      utilizationRate,
    }
  }
  return null
}

function apyFromApr(apr: number): ApyBreakdown {
  const apy = aprToApyDaily(apr)
  return { base: apy, rewards: 0, fees: 0, net: apy, rewardItems: [] }
}

function pointFromState({
  target,
  timestamp,
  state,
}: {
  target: HistoryTarget
  timestamp: Date
  state: BlendReserveHistoryState
}): HistoryDataPoint {
  if (target.kind === 'supply') {
    return {
      timestamp,
      productId: target.productId,
      kind: 'supply',
      apy: apyFromApr(state.supplyApr),
      market: {
        ...unknownSupplyMarket(),
        supplyAssets: state.supplyAssets,
        utilizationRate: state.utilizationRate,
      },
    }
  }

  return {
    timestamp,
    productId: target.productId,
    kind: 'borrow',
    apy: apyFromApr(state.borrowApr),
    market: {
      ...unknownBorrowMarket(),
      supplyAssets: state.supplyAssets,
      borrowAssets: state.borrowAssets,
      utilizationRate: state.utilizationRate,
    },
  }
}

function targetAssetId(target: HistoryTarget): string | null {
  const assetId = target.meta.assetAddress
  return typeof assetId === 'string' && assetId.length > 0 ? assetId : null
}

function expectedBucketCount(params: HistoryParams): number {
  const step = params.interval === 'DAY' ? 24 * 60 * 60 : 60 * 60
  return Math.max(
    0,
    Math.ceil((params.endTimestamp - params.startTimestamp) / step)
  )
}

async function catalogueTargets(
  params: HistoryParams,
  opts: BlendHistoryOpts
): Promise<HistoryTarget[]> {
  const version = opts.version.toLowerCase()
  const requested = requestedProducts(params)
  if (requested?.byId.size) return [...requested.byId.values()]

  const [{ and, eq, inArray }, { db }, { products }] = await Promise.all([
    import('drizzle-orm'),
    import('@/lib/db/postgres'),
    import('@/lib/db/schema'),
  ])

  const where = [
    eq(products.provider, BLEND_PROVIDER),
    eq(products.version, version),
    eq(products.chainId, -1),
  ]
  if (requested?.ids.size) {
    where.push(inArray(products.id, [...requested.ids]))
  }

  const rows = await db
    .select({
      id: products.id,
      chainId: products.chainId,
      kind: products.kind,
      version: products.version,
      protocolAddress: products.protocolAddress,
      assetAddress: products.assetAddress,
      assetSymbol: products.assetSymbol,
      meta: products.meta,
    })
    .from(products)
    .where(and(...where))

  return rows.map((row) => ({
    productId: row.id,
    chainId: row.chainId,
    kind: row.kind as 'supply' | 'borrow',
    meta: {
      ...((row.meta ?? {}) as Record<string, unknown>),
      version: row.version,
      protocolAddress: row.protocolAddress,
      assetAddress: row.assetAddress,
      assetSymbol: row.assetSymbol,
    },
  }))
}

export async function getBlendApyHistory(
  params: HistoryParams,
  opts: BlendHistoryOpts
): Promise<HistoryResult> {
  const client = getBigQueryClient()
  if (!client) {
    throw new Error(
      '[history:blend] BigQuery client unavailable; set GCP_PROJECT and GCP_SERVICE_ACCOUNT_BASE64'
    )
  }

  const targets = (await catalogueTargets(params, opts)).filter(
    (t) => t.chainId === -1 && t.meta.version === opts.version.toLowerCase()
  )
  if (targets.length === 0) return { points: [], failures: [] }

  const missingAssetFailures: HistoryFailure[] = []
  const usableTargets = targets.filter((target) => {
    if (targetAssetId(target)) return true
    missingAssetFailures.push(
      historyFailure(target, 'target meta does not contain an assetAddress')
    )
    return false
  })

  const result = await fetchStellarHubbleHistory({
    client,
    targets: usableTargets,
    startTimestamp: params.startTimestamp,
    endTimestamp: params.endTimestamp,
    interval: params.interval,
    onProgress: params.onProgress,
    decode: ({ target, bucket }) => {
      const assetId = targetAssetId(target)
      if (!assetId) return []
      const state = decodeBlendReserveHistoryState(bucket, assetId)
      if (!state) return []
      return [pointFromState({ target, timestamp: bucket.bucketStart, state })]
    },
  })

  const expected = expectedBucketCount(params)
  const pointCounts = new Map<string, number>()
  for (const point of result.points) {
    pointCounts.set(
      point.productId,
      (pointCounts.get(point.productId) ?? 0) + 1
    )
  }
  const decodeFailures = usableTargets
    .filter((target) => (pointCounts.get(target.productId) ?? 0) < expected)
    .map((target) => {
      const count = pointCounts.get(target.productId) ?? 0
      const reason =
        count === 0
          ? 'Hubble returned state buckets, but Blend decoder produced no point'
          : [
              'Blend decoder produced partial history coverage:',
              String(count) + '/' + String(expected),
              'buckets',
            ].join(' ')
      return historyFailure(target, reason)
    })

  return {
    points: result.points,
    failures: [...missingAssetFailures, ...result.failures, ...decodeFailures],
  }
}
