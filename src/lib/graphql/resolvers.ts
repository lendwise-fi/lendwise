import { GraphQLScalarType, Kind } from 'graphql'
import { Filter } from 'mongodb'

import { ALL_CHAINS } from '@/config/chains'
import { getProtocolIds } from '@/config/protocols'
import type {
  ApySlot,
  ApyDaily,
  LendApySlot,
  BorrowApySlot,
  LendApyDaily,
  BorrowApyDaily,
  BorrowMarketState,
} from '@/lib/db/types'
import {
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_DAILY,
  getDb,
} from '@/lib/db/mongodb'

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
  '7d':   7   * 24 * 60 * 60 * 1000,
  '30d':  30  * 24 * 60 * 60 * 1000,
  '90d':  90  * 24 * 60 * 60 * 1000,
  '180d': 180 * 24 * 60 * 60 * 1000,
  '1y':   365 * 24 * 60 * 60 * 1000,
}

// ─── Input types ──────────────────────────────────────────────────────────────

type HourlyFilters = {
  protocol?: string
  market?:   string
  chainId?:  number
  asset?:    string
  from?:     string
  to?:       string
}

type DailyFilters = HourlyFilters & {
  range?: string
}

type BorrowHourlyFilters = HourlyFilters & { collateral?: string }
type BorrowDailyFilters  = DailyFilters  & { collateral?: string }

// ─── Validation ───────────────────────────────────────────────────────────────

function validateProtocol(protocol: string): void {
  const valid = getProtocolIds() as string[]
  if (!valid.includes(protocol)) {
    throw new Error(`Invalid protocol: "${protocol}". Supported: ${valid.join(', ')}`)
  }
}

function validateChainId(chainId: number): void {
  const valid = ALL_CHAINS.map((c) => c.id) as number[]
  if (!valid.includes(chainId)) {
    throw new Error(`Invalid chainId: ${chainId}. Supported: ${valid.join(', ')}`)
  }
}

function buildTimeFilter(range?: string, from?: string, to?: string): Record<string, Date> {
  const filter: Record<string, Date> = {}
  if (from) {
    filter.$gte = new Date(from)
  } else if (range) {
    const ms = RANGE_TO_MS[range]
    if (ms === undefined) {
      throw new Error(`Invalid range: "${range}". Allowed: ${Object.keys(RANGE_TO_MS).join(', ')}`)
    }
    filter.$gte = new Date(Date.now() - ms)
  }
  if (to) filter.$lte = new Date(to)
  return filter
}

// ─── Shared reward items mapper ───────────────────────────────────────────────

function mapRewardItems(items: LendApySlot['apy']['rewardItems']) {
  return items.map((r) => ({
    token:   r.token,
    apr:     r.apr,
    apy:     r.apy,
    source:  r.source,
    program: r.program ?? null,
  }))
}

// ─── MongoDB → GraphQL mapping ────────────────────────────────────────────────

/**
 * ApyMeta is lean — only poolId, kind, protocol, chainId, asset (symbol).
 * chain (full object) and asset (full object) are resolved via pools lookup.
 * TODO: DataLoader from pools collection for chain.name, asset.address, asset.decimals
 */

function mapLendSlot(doc: LendApySlot) {
  return {
    hour:     doc.hour,
    poolId:   doc.meta.poolId,
    protocol: doc.meta.protocol,
    chainId:  doc.meta.chainId,
    asset:    doc.meta.asset,
    apy: {
      base:        doc.apy.base,
      rewards:     doc.apy.rewards,
      fees:        doc.apy.fees,
      net:         doc.apy.net,
      rewardItems: mapRewardItems(doc.apy.rewardItems),
    },
    market: {
      supplyAssets:    doc.market.supplyAssets,
      supplyAssetsUsd: doc.market.supplyAssetsUsd,
      utilizationRate: doc.market.utilizationRate,
      assetPriceUsd:   doc.market.assetPriceUsd,
    },
    quality: doc.quality,
  }
}

function mapBorrowSlot(doc: BorrowApySlot) {
  const market = doc.market as BorrowMarketState
  return {
    hour:        doc.hour,
    poolId:      doc.meta.poolId,
    protocol:    doc.meta.protocol,
    chainId:     doc.meta.chainId,
    asset:       doc.meta.asset,
    collaterals: [],   // TODO: DataLoader from pools collection
    apy: {
      base:        doc.apy.base,
      rewards:     doc.apy.rewards,
      fees:        doc.apy.fees,
      net:         doc.apy.net,
      rewardItems: mapRewardItems(doc.apy.rewardItems),
    },
    market: {
      supplyAssets:               market.supplyAssets,
      supplyAssetsUsd:            market.supplyAssetsUsd,
      borrowAssets:               market.borrowAssets,
      borrowAssetsUsd:            market.borrowAssetsUsd,
      utilizationRate:            market.utilizationRate,
      assetPriceUsd:              market.assetPriceUsd,
      collateralAssetsUsd:        market.collateralAssetsUsd,
      priceCollateralInLoanAsset: market.priceCollateralInLoanAsset,
    },
    quality: doc.quality,
  }
}

function mapLendDaily(doc: LendApyDaily) {
  return {
    date:     doc.date,
    poolId:   doc.meta.poolId,
    protocol: doc.meta.protocol,
    chainId:  doc.meta.chainId,
    asset:    doc.meta.asset,
    apy: {
      base:        doc.apy.base,
      rewards:     doc.apy.rewards,
      fees:        doc.apy.fees,
      net:         doc.apy.net,
      rewardItems: mapRewardItems(doc.apy.rewardItems),
    },
    market: {
      supplyAssets:    doc.market.supplyAssets,
      supplyAssetsUsd: doc.market.supplyAssetsUsd,
      utilizationRate: doc.market.utilizationRate,
      assetPriceUsd:   doc.market.assetPriceUsd,
    },
    quality: doc.quality,
  }
}

function mapBorrowDaily(doc: BorrowApyDaily) {
  const market = doc.market as BorrowMarketState
  return {
    date:        doc.date,
    poolId:      doc.meta.poolId,
    protocol:    doc.meta.protocol,
    chainId:     doc.meta.chainId,
    asset:       doc.meta.asset,
    collaterals: [],   // TODO: DataLoader from pools collection
    apy: {
      base:        doc.apy.base,
      rewards:     doc.apy.rewards,
      fees:        doc.apy.fees,
      net:         doc.apy.net,
      rewardItems: mapRewardItems(doc.apy.rewardItems),
    },
    market: {
      supplyAssets:               market.supplyAssets,
      supplyAssetsUsd:            market.supplyAssetsUsd,
      borrowAssets:               market.borrowAssets,
      borrowAssetsUsd:            market.borrowAssetsUsd,
      utilizationRate:            market.utilizationRate,
      assetPriceUsd:              market.assetPriceUsd,
      collateralAssetsUsd:        market.collateralAssetsUsd,
      priceCollateralInLoanAsset: market.priceCollateralInLoanAsset,
    },
    quality: doc.quality,
  }
}

// ─── Query builders ───────────────────────────────────────────────────────────

function buildHourlyQuery(
  kind:    'lend' | 'borrow',
  filters: HourlyFilters & { collateral?: string }
): Filter<ApySlot> {
  const { protocol, market, chainId, asset, collateral } = filters

  if (protocol) validateProtocol(protocol)
  if (chainId)  validateChainId(chainId)

  const query: Filter<ApySlot> = { 'meta.kind': kind }
  if (protocol)   query['meta.protocol'] = protocol
  if (chainId)    query['meta.chainId']  = chainId
  if (asset)      query['meta.asset']    = asset.toUpperCase()
  if (market)     query['meta.poolId']   = { $regex: market,     $options: 'i' }
  if (collateral) query['meta.poolId']   = { $regex: collateral, $options: 'i' }

  const timeFilter = buildTimeFilter(undefined, filters.from, filters.to)
  if (Object.keys(timeFilter).length > 0) {
    query.hour = timeFilter as Filter<ApySlot>['hour']
  }

  return query
}

function buildDailyQuery(
  kind:    'lend' | 'borrow',
  filters: DailyFilters & { collateral?: string }
): Filter<ApyDaily> {
  const { protocol, market, chainId, asset, collateral, range, from, to } = filters

  if (protocol) validateProtocol(protocol)
  if (chainId)  validateChainId(chainId)

  const query: Filter<ApyDaily> = { 'meta.kind': kind }
  if (protocol)   query['meta.protocol'] = protocol
  if (chainId)    query['meta.chainId']  = chainId
  if (asset)      query['meta.asset']    = asset.toUpperCase()
  if (market)     query['meta.poolId']   = { $regex: market,     $options: 'i' }
  if (collateral) query['meta.poolId']   = { $regex: collateral, $options: 'i' }

  const effectiveRange = range ?? (!from ? '30d' : undefined)
  const timeFilter     = buildTimeFilter(effectiveRange, from, to)
  if (Object.keys(timeFilter).length > 0) {
    query.date = timeFilter as Filter<ApyDaily>['date']
  }

  return query
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const resolvers = {
  DateTime,

  Query: {
    async lendApySpot(_: unknown, args: { filters?: HourlyFilters }) {
      const db    = await getDb()
      const query = buildHourlyQuery('lend', args.filters ?? {})
      const docs  = await db
        .collection<ApySlot>(MONGODB_COLLECTION_HOURLY)
        .find(query)
        .sort({ hour: 1 })
        .toArray()
      return docs.map((d) => mapLendSlot(d as LendApySlot))
    },

    async lendApyDaily(_: unknown, args: { filters?: DailyFilters }) {
      const db    = await getDb()
      const query = buildDailyQuery('lend', args.filters ?? {})
      const docs  = await db
        .collection<ApyDaily>(MONGODB_COLLECTION_DAILY)
        .find(query)
        .sort({ date: 1 })
        .toArray()
      return docs.map((d) => mapLendDaily(d as LendApyDaily))
    },

    async borrowApySpot(_: unknown, args: { filters?: BorrowHourlyFilters }) {
      const db    = await getDb()
      const query = buildHourlyQuery('borrow', args.filters ?? {})
      const docs  = await db
        .collection<ApySlot>(MONGODB_COLLECTION_HOURLY)
        .find(query)
        .sort({ hour: 1 })
        .toArray()
      return docs.map((d) => mapBorrowSlot(d as BorrowApySlot))
    },

    async borrowApyDaily(_: unknown, args: { filters?: BorrowDailyFilters }) {
      const db    = await getDb()
      const query = buildDailyQuery('borrow', args.filters ?? {})
      const docs  = await db
        .collection<ApyDaily>(MONGODB_COLLECTION_DAILY)
        .find(query)
        .sort({ date: 1 })
        .toArray()
      return docs.map((d) => mapBorrowDaily(d as BorrowApyDaily))
    },
  },
}