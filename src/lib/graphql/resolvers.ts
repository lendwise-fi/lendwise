import { GraphQLScalarType, Kind } from 'graphql'
import { Document, Filter } from 'mongodb'

import { ALL_CHAINS } from '@/config/chains'
import { getProtocolIds } from '@/config/protocols'
import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_PRODUCTS,
  getDb,
} from '@/lib/db/mongodb'
import type { ApyDaily, ApySlot, BorrowMarketState } from '@/lib/db/types'

// ─── Scalar ───────────────────────────────────────────────────────────────────

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize(value) {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string') return value
    throw new Error('DateTime serializer expected a Date or ISO string')
  },
  parseValue(value) {
    if (typeof value === 'string') return new Date(value)
    throw new Error('DateTime parser expected a string')
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) return new Date(ast.value)
    return null
  },
})

// ─── Range → ms ───────────────────────────────────────────────────────────────

const RANGE_TO_MS: Record<string, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '180d': 180 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
}

// ─── Input types ──────────────────────────────────────────────────────────────

type HourlyFilters = {
  protocol?: string
  market?: string
  chainId?: number
  asset?: string
  from?: string
  to?: string
}

type DailyFilters = HourlyFilters & {
  range?: string
}

type BorrowHourlyFilters = HourlyFilters & { collateral?: string }
type BorrowDailyFilters = DailyFilters & { collateral?: string }

// ─── Validation ───────────────────────────────────────────────────────────────

function validateProtocol(protocol: string): void {
  const valid = getProtocolIds() as string[]
  if (!valid.includes(protocol)) {
    throw new Error(
      `Invalid protocol: "${protocol}". Supported: ${valid.join(', ')}`
    )
  }
}

function validateChainId(chainId: number): void {
  const valid = ALL_CHAINS.map((c) => c.id) as number[]
  if (!valid.includes(chainId)) {
    throw new Error(
      `Invalid chainId: ${chainId}. Supported: ${valid.join(', ')}`
    )
  }
}

function buildTimeFilter(
  range?: string,
  from?: string,
  to?: string
): Record<string, Date> {
  const filter: Record<string, Date> = {}
  if (from) {
    filter.$gte = new Date(from)
  } else if (range) {
    const ms = RANGE_TO_MS[range]
    if (ms === undefined) {
      throw new Error(
        `Invalid range: "${range}". Allowed: ${Object.keys(RANGE_TO_MS).join(', ')}`
      )
    }
    filter.$gte = new Date(Date.now() - ms)
  }
  if (to) filter.$lte = new Date(to)
  return filter
}

// ─── Shared reward items mapper ───────────────────────────────────────────────

function mapRewardItems(items: ApySlot['apy']['rewardItems']) {
  return items.map((r) => ({
    token: r.token,
    apr: r.apr,
    apy: r.apy,
    source: r.source,
    program: r.program ?? null,
  }))
}

// ─── Product metadata batch loader ───────────────────────────────────────────

type ProductMeta = {
  protocol: string
  chainId: number
  asset: string
}

async function loadProductMeta(
  productIds: string[]
): Promise<Map<string, ProductMeta>> {
  const unique = [...new Set(productIds)]
  if (unique.length === 0) return new Map()

  const db = await getDb()
  const products = await db
    .collection(MONGODB_COLLECTION_PRODUCTS!)
    .find(
      { _id: { $in: unique } as unknown as Filter<Document>['_id'] },
      { projection: { kind: 1, protocol: 1, asset: 1 } }
    )
    .toArray()

  const map = new Map<string, ProductMeta>()
  for (const p of products) {
    map.set(String(p._id), {
      protocol: p.protocol?.provider ?? '',
      chainId: p.protocol?.chain?.id ?? 0,
      asset: p.asset?.symbol ?? '',
    })
  }
  return map
}

// ─── MongoDB → GraphQL mapping ────────────────────────────────────────────────

function mapSlot(
  doc: ApySlot,
  meta: ProductMeta | undefined,
  isBorrow: boolean
) {
  const base = {
    hour: doc.hour,
    productId: doc.productId,
    protocol: meta?.protocol ?? '',
    chainId: meta?.chainId ?? 0,
    asset: meta?.asset ?? '',
    apy: {
      base: doc.apy.base,
      rewards: doc.apy.rewards,
      fees: doc.apy.fees,
      net: doc.apy.net,
      rewardItems: mapRewardItems(doc.apy.rewardItems),
    },
    quality: doc.quality,
  }

  if (!isBorrow) {
    return {
      ...base,
      market: {
        supplyAssets: doc.market.supplyAssets,
        supplyAssetsUsd: doc.market.supplyAssetsUsd,
        utilizationRate: doc.market.utilizationRate,
        assetPriceUsd: doc.market.assetPriceUsd,
      },
    }
  }

  const m = doc.market as BorrowMarketState
  return {
    ...base,
    collaterals: [], // TODO: DataLoader from pools collection
    market: {
      supplyAssets: m.supplyAssets,
      supplyAssetsUsd: m.supplyAssetsUsd,
      borrowAssets: m.borrowAssets,
      borrowAssetsUsd: m.borrowAssetsUsd,
      utilizationRate: m.utilizationRate,
      assetPriceUsd: m.assetPriceUsd,
      collateralAssetsUsd: m.collateralAssetsUsd,
      priceCollateralInLoanAsset: m.priceCollateralInLoanAsset,
    },
  }
}

function mapDaily(
  doc: ApyDaily,
  meta: ProductMeta | undefined,
  isBorrow: boolean
) {
  const base = {
    date: doc.date,
    productId: doc.productId,
    protocol: meta?.protocol ?? '',
    chainId: meta?.chainId ?? 0,
    asset: meta?.asset ?? '',
    apy: {
      base: doc.apy.base,
      rewards: doc.apy.rewards,
      fees: doc.apy.fees,
      net: doc.apy.net,
      rewardItems: mapRewardItems(doc.apy.rewardItems),
    },
  }

  if (!isBorrow) {
    return {
      ...base,
      market: {
        supplyAssets: doc.market.supplyAssets,
        supplyAssetsUsd: doc.market.supplyAssetsUsd,
        utilizationRate: doc.market.utilizationRate,
        assetPriceUsd: doc.market.assetPriceUsd,
      },
    }
  }

  const m = doc.market as BorrowMarketState
  return {
    ...base,
    collaterals: [], // TODO: DataLoader from pools collection
    market: {
      supplyAssets: m.supplyAssets,
      supplyAssetsUsd: m.supplyAssetsUsd,
      borrowAssets: m.borrowAssets,
      borrowAssetsUsd: m.borrowAssetsUsd,
      utilizationRate: m.utilizationRate,
      assetPriceUsd: m.assetPriceUsd,
      collateralAssetsUsd: m.collateralAssetsUsd,
      priceCollateralInLoanAsset: m.priceCollateralInLoanAsset,
    },
  }
}

// ─── Query builders ───────────────────────────────────────────────────────────

/**
 * Build a productId-based query filter.
 * Hourly/daily docs only store productId — kind, protocol, market, collateral
 * are matched via regex on the productId string.
 *
 * productId format: "{provider}:{version}:{chain}:{type}:{address}:{kind}"
 * e.g. "aave:v3:ethereum:reserve:0x1111…:supply"
 */
function buildProductIdFilter(
  kind: 'supply' | 'borrow',
  filters: {
    protocol?: string
    market?: string
    chainId?: number
    asset?: string
    collateral?: string
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  const { protocol, market, collateral } = filters

  if (protocol) validateProtocol(protocol)
  if (filters.chainId) validateChainId(filters.chainId)

  // Kind is always the last segment of productId
  const patterns: string[] = [`:${kind}$`]

  // Protocol prefix — aave_v3 → "^aave"
  if (protocol) {
    const prefix = protocol.split('_')[0]
    patterns.push(`^${prefix}`)
  }

  if (market) patterns.push(market)
  if (collateral) patterns.push(collateral)

  const combined = patterns.map((p) => `(?=.*${p})`).join('')

  return { productId: { $regex: combined, $options: 'i' } }
}

function buildHourlyQuery(
  kind: 'supply' | 'borrow',
  filters: HourlyFilters & { collateral?: string }
): Filter<ApySlot> {
  const query: Filter<ApySlot> = {
    ...buildProductIdFilter(kind, filters),
  }

  const timeFilter = buildTimeFilter(undefined, filters.from, filters.to)
  if (Object.keys(timeFilter).length > 0) {
    query.hour = timeFilter as Filter<ApySlot>['hour']
  }

  return query
}

function buildDailyQuery(
  kind: 'supply' | 'borrow',
  filters: DailyFilters & { collateral?: string }
): Filter<ApyDaily> {
  const { range, from } = filters

  const query: Filter<ApyDaily> = {
    ...buildProductIdFilter(kind, filters),
  }

  const effectiveRange = range ?? (!from ? '30d' : undefined)
  const timeFilter = buildTimeFilter(effectiveRange, from, filters.to)
  if (Object.keys(timeFilter).length > 0) {
    query.date = timeFilter as Filter<ApyDaily>['date']
  }

  return query
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const resolvers = {
  DateTime,

  Query: {
    async supplyApyHourly(_: unknown, args: { filters?: HourlyFilters }) {
      const db = await getDb()
      const query = buildHourlyQuery('supply', args.filters ?? {})
      const docs = await db
        .collection<ApySlot>(MONGODB_COLLECTION_HOURLY)
        .find(query)
        .sort({ hour: 1 })
        .limit(10_000)
        .toArray()
      const metaMap = await loadProductMeta(docs.map((d) => d.productId))
      return docs.map((d) => mapSlot(d, metaMap.get(d.productId), false))
    },

    async supplyApyDaily(_: unknown, args: { filters?: DailyFilters }) {
      const db = await getDb()
      const query = buildDailyQuery('supply', args.filters ?? {})
      const docs = await db
        .collection<ApyDaily>(MONGODB_COLLECTION_DAILY)
        .find(query)
        .sort({ date: 1 })
        .limit(10_000)
        .toArray()
      const metaMap = await loadProductMeta(docs.map((d) => d.productId))
      return docs.map((d) => mapDaily(d, metaMap.get(d.productId), false))
    },

    async borrowApyHourly(_: unknown, args: { filters?: BorrowHourlyFilters }) {
      const db = await getDb()
      const query = buildHourlyQuery('borrow', args.filters ?? {})
      const docs = await db
        .collection<ApySlot>(MONGODB_COLLECTION_HOURLY)
        .find(query)
        .sort({ hour: 1 })
        .limit(10_000)
        .toArray()
      const metaMap = await loadProductMeta(docs.map((d) => d.productId))
      return docs.map((d) => mapSlot(d, metaMap.get(d.productId), true))
    },

    async borrowApyDaily(_: unknown, args: { filters?: BorrowDailyFilters }) {
      const db = await getDb()
      const query = buildDailyQuery('borrow', args.filters ?? {})
      const docs = await db
        .collection<ApyDaily>(MONGODB_COLLECTION_DAILY)
        .find(query)
        .sort({ date: 1 })
        .limit(10_000)
        .toArray()
      const metaMap = await loadProductMeta(docs.map((d) => d.productId))
      return docs.map((d) => mapDaily(d, metaMap.get(d.productId), true))
    },
  },
}
