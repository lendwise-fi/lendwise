import { GraphQLScalarType, Kind } from 'graphql'

import { type ApyFilters, type Page, queryApy } from '@/lib/db/repositories/apy'
import type { ProductRow } from '@/lib/db/schema'

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

// ─── Reward items ───────────────────────────────────────────────────────────

type RewardItemRow = {
  token: { symbol: string; address: string }
  apr: number
  apy: number
  source: 'protocol' | 'merkl' | 'merit'
  program: string | null
}

function mapRewardItems(items: RewardItemRow[]) {
  return items.map((r) => ({
    token: r.token,
    apr: r.apr,
    apy: r.apy,
    source: r.source,
    program: r.program ?? null,
  }))
}

// ─── Row + arg shapes ─────────────────────────────────────────────────────────

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

// ─── Row → GraphQL mapping ────────────────────────────────────────────────────

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

// ─── Filtered read (JOIN products on indexed columns — no regex) ───────────────

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
      mapPgRow(
        grain,
        isBorrow,
        r as unknown as { row: AnyApyRow; product: ProductRow }
      )
    ),
    pagination: {
      count: rows.length,
      countTotal,
      limit: page.first,
      skip: page.skip,
    },
  }
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const resolvers = {
  DateTime,
  JSON: JSON_SCALAR,

  Query: {
    async supplyApyHourly(_: unknown, args: ResolverArgs) {
      return resolvePg('hourly', 'supply', args)
    },
    async supplyApyDaily(_: unknown, args: ResolverArgs) {
      return resolvePg('daily', 'supply', args)
    },
    async borrowApyHourly(_: unknown, args: ResolverArgs) {
      return resolvePg('hourly', 'borrow', args)
    },
    async borrowApyDaily(_: unknown, args: ResolverArgs) {
      return resolvePg('daily', 'borrow', args)
    },
  },
}
