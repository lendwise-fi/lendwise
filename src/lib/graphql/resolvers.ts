import { GraphQLScalarType, Kind } from 'graphql'
import { Document, Filter } from 'mongodb'

import { ALL_CHAINS } from '@/config/chains'
import { getProtocolIds } from '@/config/protocols'
import { dbBackend } from '@/lib/db/env'
import {
  queryApy,
  type ApyFilters,
  type Page,
} from '@/lib/db/repositories/apy'
import type { ProductRow } from '@/lib/db/schema'
import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_PRODUCTS,
  getDb,
} from '@/lib/db/mongodb'
import type {
  ApyDaily,
  ApySlot,
  BorrowMarketState,
  Product,
} from '@/lib/db/types'

// ─── Scalars ──────────────────────────────────────────────────────────────────

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

const JSON_SCALAR = new GraphQLScalarType({
  name: 'JSON',
  serialize(value) {
    return value
  },
  parseValue(value) {
    return value
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) return globalThis.JSON.parse(ast.value)
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

type PaginationArgs = {
  first?: number
  skip?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

const MAX_LIMIT = 10_000

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

async function loadProducts(
  productIds: string[]
): Promise<Map<string, Product>> {
  const unique = [...new Set(productIds)]
  if (unique.length === 0) return new Map()

  const db = await getDb()
  const products = await db
    .collection(MONGODB_COLLECTION_PRODUCTS!)
    .find({ _id: { $in: unique } as unknown as Filter<Document>['_id'] })
    .toArray()

  const map = new Map<string, Product>()
  for (const p of products) {
    map.set(String(p._id), p as unknown as Product)
  }
  return map
}

function mapProduct(p: Product | undefined) {
  if (!p) return null
  return {
    id: p._id,
    active: p.active,
    kind: p.kind,
    asset: p.asset,
    protocol: {
      provider: p.protocol.provider,
      type: p.protocol.type,
      version: p.protocol.version,
      name: p.protocol.name,
      chain: p.protocol.chain,
      address: p.protocol.address,
      meta: p.protocol.meta ?? null,
    },
    collaterals: 'collaterals' in p ? p.collaterals : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

// ─── MongoDB → GraphQL mapping ────────────────────────────────────────────────

function mapSlot(
  doc: ApySlot,
  product: Product | undefined,
  isBorrow: boolean
) {
  const base = {
    hour: doc.hour,
    productId: doc.productId,
    protocol: product?.protocol?.provider ?? '',
    chainId: product?.protocol?.chain?.id ?? 0,
    asset: product?.asset?.symbol ?? '',
    product: mapProduct(product),
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
  product: Product | undefined,
  isBorrow: boolean
) {
  const base = {
    date: doc.date,
    productId: doc.productId,
    protocol: product?.protocol?.provider ?? '',
    chainId: product?.protocol?.chain?.id ?? 0,
    asset: product?.asset?.symbol ?? '',
    product: mapProduct(product),
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

// ─── Postgres read path (JOIN products, no regex) ──────────────────────────────

type RewardItemRow = {
  token: { symbol: string; address: string }
  apr: number
  apy: number
  source: 'protocol' | 'merkl' | 'merit'
  program: string | null
}

/** Row shape covering both apy_hourly and apy_daily (drizzle camelCase columns). */
type AnyApyRow = {
  hour?: Date
  date?: Date
  apyBase: number
  apyRewards: number
  apyFees: number
  apyNet: number
  rewardItems: RewardItemRow[]
  supplyAssets: number | null
  supplyAssetsUsd: number | null
  utilizationRate: number | null
  assetPriceUsd: number | null
  borrowAssets: number | null
  borrowAssetsUsd: number | null
  collateralAssetsUsd: number | null
  priceCollateralInLoanAsset: number | null
  qualityCount?: number
  qualityExpectedCount?: number
  qualityFirstSlot?: Date
  qualityLastSlot?: Date
  qualityStatus?: string
}

type AnyFilters = {
  protocol?: string
  market?: string
  chainId?: number
  asset?: string
  collateral?: string
  from?: string
  to?: string
  range?: string
}

type ResolverArgs = {
  filters?: AnyFilters
  first?: number
  skip?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

const RANGE_TO_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '1y': 365,
}

function mapPgRow(
  grain: 'hourly' | 'daily',
  isBorrow: boolean,
  { row, product }: { row: AnyApyRow; product: ProductRow }
) {
  const base = {
    ...(grain === 'hourly' ? { hour: row.hour } : { date: row.date }),
    productId: product.id,
    protocol: product.provider,
    chainId: product.chainId,
    asset: product.assetSymbol,
    product: {
      id: product.id,
      active: product.active,
      kind: product.kind,
      asset: {
        symbol: product.assetSymbol,
        name: product.assetName,
        address: product.assetAddress,
        decimals: product.assetDecimals,
      },
      protocol: {
        provider: product.provider,
        type: product.productType,
        version: product.version,
        name: product.protocolName,
        chain: { id: product.chainId, name: product.chainName },
        address: product.protocolAddress,
        meta: product.meta ?? null,
      },
      collaterals: product.collaterals ?? null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    },
    apy: {
      base: row.apyBase,
      rewards: row.apyRewards,
      fees: row.apyFees,
      net: row.apyNet,
      rewardItems: mapRewardItems(row.rewardItems ?? []),
    },
  }

  const quality =
    grain === 'hourly'
      ? {
          quality: {
            count: row.qualityCount,
            expectedCount: row.qualityExpectedCount,
            firstSlot: row.qualityFirstSlot,
            lastSlot: row.qualityLastSlot,
            status: row.qualityStatus,
          },
        }
      : {}

  const market = isBorrow
    ? {
        supplyAssets: row.supplyAssets,
        supplyAssetsUsd: row.supplyAssetsUsd,
        borrowAssets: row.borrowAssets,
        borrowAssetsUsd: row.borrowAssetsUsd,
        utilizationRate: row.utilizationRate,
        assetPriceUsd: row.assetPriceUsd,
        collateralAssetsUsd: row.collateralAssetsUsd,
        priceCollateralInLoanAsset: row.priceCollateralInLoanAsset,
      }
    : {
        supplyAssets: row.supplyAssets,
        supplyAssetsUsd: row.supplyAssetsUsd,
        utilizationRate: row.utilizationRate,
        assetPriceUsd: row.assetPriceUsd,
      }

  return isBorrow
    ? { ...base, ...quality, collaterals: product.collaterals ?? [], market }
    : { ...base, ...quality, market }
}

async function resolvePg(
  grain: 'hourly' | 'daily',
  kind: 'supply' | 'borrow',
  args: ResolverArgs
) {
  const filters = args.filters ?? {}
  const f: ApyFilters = {
    kind,
    protocol: filters.protocol,
    market: filters.market,
    chainId: filters.chainId,
    asset: filters.asset,
    collateral: filters.collateral,
    from: filters.from ? new Date(filters.from) : undefined,
    to: filters.to ? new Date(filters.to) : undefined,
  }
  // Daily defaults to last 30 days when neither `from` nor `range` is given.
  if (grain === 'daily' && !f.from) {
    const days = filters.range ? (RANGE_TO_DAYS[filters.range] ?? 30) : 30
    f.from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  }

  const page: Page = {
    first: args.first ?? 100,
    skip: args.skip ?? 0,
    orderBy: grain === 'hourly' ? 'hour' : 'date',
    orderDir: args.orderDirection === 'desc' ? 'desc' : 'asc',
  }

  const { rows, countTotal } = await queryApy(grain, f, page)
  const isBorrow = kind === 'borrow'
  return {
    items: rows.map((r) =>
      mapPgRow(grain, isBorrow, r as unknown as { row: AnyApyRow; product: ProductRow })
    ),
    pagination: { count: rows.length, countTotal, limit: page.first, skip: page.skip },
  }
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const resolvers = {
  DateTime,
  JSON: JSON_SCALAR,

  Query: {
    async supplyApyHourly(
      _: unknown,
      args: { filters?: HourlyFilters } & PaginationArgs
    ) {
      if (dbBackend() === 'postgres') return resolvePg('hourly', 'supply', args)
      const db = await getDb()
      const query = buildHourlyQuery('supply', args.filters ?? {})
      const collection = db.collection<ApySlot>(MONGODB_COLLECTION_HOURLY)

      const limit = Math.min(args.first ?? 100, MAX_LIMIT)
      const skip = args.skip ?? 0
      const sortField = args.orderBy ?? 'hour'
      const sortDir = args.orderDirection === 'desc' ? -1 : 1

      const [countTotal, docs] = await Promise.all([
        collection.countDocuments(query),
        collection
          .find(query)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limit)
          .toArray(),
      ])

      const productMap = await loadProducts(docs.map((d) => d.productId))
      return {
        items: docs.map((d) => mapSlot(d, productMap.get(d.productId), false)),
        pagination: { count: docs.length, countTotal, limit, skip },
      }
    },

    async supplyApyDaily(
      _: unknown,
      args: { filters?: DailyFilters } & PaginationArgs
    ) {
      if (dbBackend() === 'postgres') return resolvePg('daily', 'supply', args)
      const db = await getDb()
      const query = buildDailyQuery('supply', args.filters ?? {})
      const collection = db.collection<ApyDaily>(MONGODB_COLLECTION_DAILY)

      const limit = Math.min(args.first ?? 100, MAX_LIMIT)
      const skip = args.skip ?? 0
      const sortField = args.orderBy ?? 'date'
      const sortDir = args.orderDirection === 'desc' ? -1 : 1

      const [countTotal, docs] = await Promise.all([
        collection.countDocuments(query),
        collection
          .find(query)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limit)
          .toArray(),
      ])

      const productMap = await loadProducts(docs.map((d) => d.productId))
      return {
        items: docs.map((d) => mapDaily(d, productMap.get(d.productId), false)),
        pagination: { count: docs.length, countTotal, limit, skip },
      }
    },

    async borrowApyHourly(
      _: unknown,
      args: { filters?: BorrowHourlyFilters } & PaginationArgs
    ) {
      if (dbBackend() === 'postgres') return resolvePg('hourly', 'borrow', args)
      const db = await getDb()
      const query = buildHourlyQuery('borrow', args.filters ?? {})
      const collection = db.collection<ApySlot>(MONGODB_COLLECTION_HOURLY)

      const limit = Math.min(args.first ?? 100, MAX_LIMIT)
      const skip = args.skip ?? 0
      const sortField = args.orderBy ?? 'hour'
      const sortDir = args.orderDirection === 'desc' ? -1 : 1

      const [countTotal, docs] = await Promise.all([
        collection.countDocuments(query),
        collection
          .find(query)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limit)
          .toArray(),
      ])

      const productMap = await loadProducts(docs.map((d) => d.productId))
      return {
        items: docs.map((d) => mapSlot(d, productMap.get(d.productId), true)),
        pagination: { count: docs.length, countTotal, limit, skip },
      }
    },

    async borrowApyDaily(
      _: unknown,
      args: { filters?: BorrowDailyFilters } & PaginationArgs
    ) {
      if (dbBackend() === 'postgres') return resolvePg('daily', 'borrow', args)
      const db = await getDb()
      const query = buildDailyQuery('borrow', args.filters ?? {})
      const collection = db.collection<ApyDaily>(MONGODB_COLLECTION_DAILY)

      const limit = Math.min(args.first ?? 100, MAX_LIMIT)
      const skip = args.skip ?? 0
      const sortField = args.orderBy ?? 'date'
      const sortDir = args.orderDirection === 'desc' ? -1 : 1

      const [countTotal, docs] = await Promise.all([
        collection.countDocuments(query),
        collection
          .find(query)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limit)
          .toArray(),
      ])

      const productMap = await loadProducts(docs.map((d) => d.productId))
      return {
        items: docs.map((d) => mapDaily(d, productMap.get(d.productId), true)),
        pagination: { count: docs.length, countTotal, limit, skip },
      }
    },
  },
}
