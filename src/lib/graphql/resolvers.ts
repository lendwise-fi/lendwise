import { GraphQLScalarType, Kind } from 'graphql'
import { Filter } from 'mongodb'

import { ALL_CHAINS } from '@/config/chains'
import { getProtocolIds } from '@/config/protocols'
import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_SPOT,
  getDb,
} from '@/lib/db/mongodb'
import type {
  ApyDaily,
  ApySpot,
  BorrowApyDaily,
  BorrowApySpot,
  LendApyDaily,
  LendApySpot,
} from '@/lib/db/types'

// ─── Scalar ───────────────────────────────────────────────────────────────────

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description:
    'A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.',
  serialize(value) {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string') return value
    throw new Error(
      'GraphQL DateTime Scalar serializer expected a `Date` object or an ISO string'
    )
  },
  parseValue(value) {
    if (typeof value === 'string') return new Date(value)
    throw new Error('GraphQL DateTime Scalar parser expected a `string`')
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) return new Date(ast.value)
    return null
  },
})

// ─── Timeframe → collection ───────────────────────────────────────────────────

const TIMEFRAME_TO_COLLECTION: Record<string, string> = {
  SPOT: MONGODB_COLLECTION_SPOT,
  DAILY: MONGODB_COLLECTION_DAILY,
}

// ─── Range shorthand → milliseconds ──────────────────────────────────────────

const RANGE_TO_MS: Record<string, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '180d': 180 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
}

// ─── Input types ──────────────────────────────────────────────────────────────

type LendApyRequest = {
  timeframe: 'SPOT' | 'DAILY'
  protocol?: string
  market?: string
  chainId?: number
  asset?: string
  from?: string
  to?: string
  range?: string
}

type BorrowApyRequest = {
  timeframe: 'SPOT' | 'DAILY'
  protocol?: string
  market?: string
  chainId?: number
  asset?: string
  collateral?: string
  from?: string
  to?: string
  range?: string
}

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

// ─── MongoDB → GraphQL mapping ────────────────────────────────────────────────

function mapSpotToGraphQL(doc: LendApySpot | BorrowApySpot) {
  const base = {
    poolId: doc.meta.poolId,
    protocol: doc.meta.protocol,
    chain: doc.meta.chain,
    asset: doc.meta.asset,
    apy: {
      base: doc.apy.base,
      rewards: doc.apy.rewards,
      fees: doc.apy.fees,
      net: doc.apy.net,
      rewardItems: doc.apy.rewardItems.map((r) => ({
        token: r.token,
        apr: r.apr,
        apy: r.apy,
        source: r.source,
        program: r.program ?? null,
      })),
    },
    quality: {
      status: doc.quality.status,
      fetchedAt: doc.quality.fetchedAt,
      revision: doc.quality.revision,
    },
  }

  if (doc.meta.kind === 'lend') {
    const lend = doc as LendApySpot
    return {
      ...base,
      timestamp: lend.timestamp,
      market: {
        supplyAssetsUsd: lend.market.supplyAssetsUsd,
        availableLiquidity: lend.market.availableLiquidity,
        utilizationRate: lend.market.utilizationRate,
        assetPriceUsd: lend.market.assetPriceUsd,
      },
    }
  }

  const borrow = doc as BorrowApySpot
  return {
    ...base,
    timestamp: borrow.timestamp,
    collaterals: [], // TODO: DataLoader from pools collection
    market: {
      supplyAssetsUsd: borrow.market.supplyAssetsUsd,
      borrowAssetsUsd: borrow.market.borrowAssetsUsd,
      availableLiquidity: borrow.market.availableLiquidity,
      utilizationRate: borrow.market.utilizationRate,
      assetPriceUsd: borrow.market.assetPriceUsd,
      collateralAssetsUsd: borrow.market.collateralAssetsUsd,
      priceCollateralInLoanAsset: borrow.market.priceCollateralInLoanAsset,
    },
  }
}

function mapDailyToGraphQL(doc: LendApyDaily | BorrowApyDaily) {
  const base = {
    date: doc.date,
    poolId: doc.poolId,
    protocol: doc.meta.protocol,
    chain: doc.meta.chain,
    asset: doc.meta.asset,
    apy: {
      base: doc.apy.base,
      net: doc.apy.net,
      rewards: doc.apy.rewards,
      fees: doc.apy.fees,
    },
    quality: {
      actualCount: doc.quality.actualCount,
      completeness: doc.quality.completeness,
      status: doc.quality.status,
      revision: doc.quality.revision,
      computedAt: doc.quality.computedAt,
    },
  }

  if (doc.meta.kind === 'lend') {
    const lend = doc as LendApyDaily
    return {
      ...base,
      market: {
        supplyAssetsUsd: lend.market.supplyAssetsUsd,
        availableLiquidity: lend.market.availableLiquidity,
        utilizationRate: lend.market.utilizationRate,
        assetPriceUsd: lend.market.assetPriceUsd,
      },
    }
  }

  const borrow = doc as BorrowApyDaily
  return {
    ...base,
    collaterals: [], // TODO: DataLoader from pools collection
    market: {
      supplyAssetsUsd: borrow.market.supplyAssetsUsd,
      borrowAssetsUsd: borrow.market.borrowAssetsUsd,
      availableLiquidity: borrow.market.availableLiquidity,
      collateralAssetsUsd: borrow.market.collateralAssetsUsd,
      utilizationRate: borrow.market.utilizationRate,
      assetPriceUsd: borrow.market.assetPriceUsd,
      priceCollateralInLoanAsset: borrow.market.priceCollateralInLoanAsset,
    },
  }
}

// ─── Core resolver ────────────────────────────────────────────────────────────

async function resolveApy(
  kind: 'lend' | 'borrow',
  args: LendApyRequest | BorrowApyRequest
) {
  const { timeframe, protocol, market, chainId, asset, from, to, range } = args
  const collateral = (args as BorrowApyRequest).collateral

  const collectionName = TIMEFRAME_TO_COLLECTION[timeframe]
  if (!collectionName) {
    throw new Error(`Invalid timeframe: "${timeframe}". Allowed: SPOT, DAILY`)
  }

  if (protocol) validateProtocol(protocol)
  if (chainId) validateChainId(chainId)

  const db = await getDb()

  // ─── SPOT ──────────────────────────────────────────────────────────────────
  if (timeframe === 'SPOT') {
    const query: Filter<ApySpot> = { 'meta.kind': kind }

    if (protocol) query['meta.protocol'] = protocol
    if (chainId) query['meta.chain.id'] = chainId
    if (asset) query['meta.asset.symbol'] = asset.toUpperCase()
    if (market) query['meta.poolId'] = { $regex: market, $options: 'i' }
    if (collateral) query['meta.poolId'] = { $regex: collateral, $options: 'i' }

    const timeFilter = buildTimeFilter(range, from, to)
    if (Object.keys(timeFilter).length > 0) {
      query.timestamp = timeFilter as Filter<ApySpot>['timestamp']
    }

    const docs = await db
      .collection<ApySpot>(collectionName)
      .find(query)
      .sort({ timestamp: 1 })
      .toArray()

    return docs.map((doc) =>
      mapSpotToGraphQL(doc as LendApySpot | BorrowApySpot)
    )
  }

  // ─── DAILY ────────────────────────────────────────────────────────────────
  const query: Filter<ApyDaily> = { 'meta.kind': kind }

  if (protocol) query['meta.protocol'] = protocol
  if (chainId) query['meta.chain.id'] = chainId
  if (asset) query['meta.asset.symbol'] = asset.toUpperCase()
  if (market) query.poolId = { $regex: market, $options: 'i' }
  if (collateral) query.poolId = { $regex: collateral, $options: 'i' }

  const effectiveRange = range ?? (!from ? '30d' : undefined)
  const timeFilter = buildTimeFilter(effectiveRange, from, to)
  if (Object.keys(timeFilter).length > 0) {
    query.date = timeFilter as Filter<ApyDaily>['date']
  }

  const docs = await db
    .collection<ApyDaily>(collectionName)
    .find(query)
    .sort({ date: 1 })
    .toArray()

  return docs.map((doc) =>
    mapDailyToGraphQL(doc as LendApyDaily | BorrowApyDaily)
  )
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const resolvers = {
  DateTime,

  // Union type resolution — discriminate on `timestamp` (SPOT) vs `date` (DAILY)
  LendApyResult: {
    __resolveType: (obj: Record<string, unknown>) =>
      'timestamp' in obj ? 'LendSpotResult' : 'LendDailyResult',
  },
  BorrowApyResult: {
    __resolveType: (obj: Record<string, unknown>) =>
      'timestamp' in obj ? 'BorrowSpotResult' : 'BorrowDailyResult',
  },

  Query: {
    lendApy: (_: unknown, args: { request: LendApyRequest }) =>
      resolveApy('lend', args.request),
    borrowApy: (_: unknown, args: { request: BorrowApyRequest }) =>
      resolveApy('borrow', args.request),
  },
}
