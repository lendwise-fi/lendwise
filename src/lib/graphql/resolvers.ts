import { GraphQLScalarType, Kind } from 'graphql'
import { Filter } from 'mongodb'

import { ALL_CHAINS } from '@/config/chains'
import { getProtocolIds } from '@/config/protocols'
import type {
  ApySpot,
  ApyDaily,
  LendApySpot,
  BorrowApySpot,
  LendApyDaily,
  BorrowApyDaily,
} from '@/lib/db/types'
import {
  MONGODB_COLLECTION_SPOT,
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

type SpotFilters = {
  protocol?: string
  market?:   string
  chainId?:  number
  asset?:    string
  from?:     string
  to?:       string
}

type DailyFilters = SpotFilters & {
  range?: string
}

type BorrowSpotFilters  = SpotFilters  & { collateral?: string }
type BorrowDailyFilters = DailyFilters & { collateral?: string }

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

// ─── MongoDB → GraphQL mapping ────────────────────────────────────────────────

function mapLendSpot(doc: LendApySpot) {
  return {
    timestamp: doc.timestamp,
    poolId:    doc.meta.poolId,
    protocol:  doc.meta.protocol,
    chain:     doc.meta.chain,
    asset:     doc.meta.asset,
    apy: {
      base:        doc.apy.base,
      rewards:     doc.apy.rewards,
      fees:        doc.apy.fees,
      net:         doc.apy.net,
      rewardItems: doc.apy.rewardItems.map((r) => ({
        token:   r.token,
        apr:     r.apr,
        apy:     r.apy,
        source:  r.source,
        program: r.program ?? null,
      })),
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

function mapBorrowSpot(doc: BorrowApySpot) {
  return {
    timestamp:   doc.timestamp,
    poolId:      doc.meta.poolId,
    protocol:    doc.meta.protocol,
    chain:       doc.meta.chain,
    asset:       doc.meta.asset,
    collaterals: [],   // TODO: DataLoader from pools collection
    apy: {
      base:        doc.apy.base,
      rewards:     doc.apy.rewards,
      fees:        doc.apy.fees,
      net:         doc.apy.net,
      rewardItems: doc.apy.rewardItems.map((r) => ({
        token:   r.token,
        apr:     r.apr,
        apy:     r.apy,
        source:  r.source,
        program: r.program ?? null,
      })),
    },
    market: {
      supplyAssets:               doc.market.supplyAssets,
      supplyAssetsUsd:            doc.market.supplyAssetsUsd,
      borrowAssets:               doc.market.borrowAssets,
      borrowAssetsUsd:            doc.market.borrowAssetsUsd,
      utilizationRate:            doc.market.utilizationRate,
      assetPriceUsd:              doc.market.assetPriceUsd,
      collateralAssetsUsd:        doc.market.collateralAssetsUsd,
      priceCollateralInLoanAsset: doc.market.priceCollateralInLoanAsset,
    },
    quality: doc.quality,
  }
}

function mapLendDaily(doc: LendApyDaily) {
  return {
    date:     doc.date,
    poolId:   doc.poolId,
    protocol: doc.meta.protocol,
    chain:    doc.meta.chain,
    asset:    doc.meta.asset,
    apy:      doc.apy,
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
  return {
    date:        doc.date,
    poolId:      doc.poolId,
    protocol:    doc.meta.protocol,
    chain:       doc.meta.chain,
    asset:       doc.meta.asset,
    collaterals: [],   // TODO: DataLoader from pools collection
    apy:         doc.apy,
    market: {
      supplyAssets:               doc.market.supplyAssets,
      supplyAssetsUsd:            doc.market.supplyAssetsUsd,
      borrowAssets:               doc.market.borrowAssets,
      borrowAssetsUsd:            doc.market.borrowAssetsUsd,
      collateralAssetsUsd:        doc.market.collateralAssetsUsd,
      utilizationRate:            doc.market.utilizationRate,
      assetPriceUsd:              doc.market.assetPriceUsd,
      priceCollateralInLoanAsset: doc.market.priceCollateralInLoanAsset,
    },
    quality: doc.quality,
  }
}

// ─── Query builders ───────────────────────────────────────────────────────────

function buildSpotQuery(
  kind:       'lend' | 'borrow',
  filters:    SpotFilters & { collateral?: string }
): Filter<ApySpot> {
  const { protocol, market, chainId, asset, collateral } = filters

  if (protocol) validateProtocol(protocol)
  if (chainId)  validateChainId(chainId)

  const query: Filter<ApySpot> = { 'meta.kind': kind }
  if (protocol)   query['meta.protocol']    = protocol
  if (chainId)    query['meta.chain.id']    = chainId
  if (asset)      query['meta.asset.symbol']= asset.toUpperCase()
  if (market)     query['meta.poolId']      = { $regex: market,     $options: 'i' }
  if (collateral) query['meta.poolId']      = { $regex: collateral, $options: 'i' }

  const timeFilter = buildTimeFilter(undefined, filters.from, filters.to)
  if (Object.keys(timeFilter).length > 0) {
    query.timestamp = timeFilter as Filter<ApySpot>['timestamp']
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
  if (protocol)   query['meta.protocol']     = protocol
  if (chainId)    query['meta.chain.id']     = chainId
  if (asset)      query['meta.asset.symbol'] = asset.toUpperCase()
  if (market)     query.poolId               = { $regex: market,     $options: 'i' }
  if (collateral) query.poolId               = { $regex: collateral, $options: 'i' }

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
    async lendApySpot(_: unknown, args: { filters?: SpotFilters }) {
      const db    = await getDb()
      const query = buildSpotQuery('lend', args.filters ?? {})
      const docs  = await db
        .collection<ApySpot>(MONGODB_COLLECTION_SPOT)
        .find(query)
        .sort({ timestamp: 1 })
        .toArray()
      return docs.map((d) => mapLendSpot(d as LendApySpot))
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

    async borrowApySpot(_: unknown, args: { filters?: BorrowSpotFilters }) {
      const db    = await getDb()
      const query = buildSpotQuery('borrow', args.filters ?? {})
      const docs  = await db
        .collection<ApySpot>(MONGODB_COLLECTION_SPOT)
        .find(query)
        .sort({ timestamp: 1 })
        .toArray()
      return docs.map((d) => mapBorrowSpot(d as BorrowApySpot))
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