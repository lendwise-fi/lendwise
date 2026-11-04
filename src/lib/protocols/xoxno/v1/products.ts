import type { LendingAsset } from '@xoxno/sdk-js/stellar-lending/read'

import type {
  BorrowProduct,
  Collateral,
  SpotPayload,
  SupplyProduct,
} from '@/lib/db/types'
import { dedupeInFlight } from '@/lib/protocols/core/toolkit/inflight'
import type { FetchOpts } from '@/lib/protocols/core/types'

import { type XoxnoClient, xoxnoClient } from './client'
import { XOXNO_CHAIN_ID, XOXNO_PROVIDER } from './config'
import type { XoxnoContext, XoxnoReserve } from './schemas'
import type { XoxnoCollateral, XoxnoMeta, XoxnoSpoke } from './types'
import { xoxnoProductId } from './utils'

export type XoxnoProduct = SupplyProduct<XoxnoMeta> | BorrowProduct<XoxnoMeta>
const marketKey = (hubId: number, asset: string) => `${hubId}:${asset}`
const reserveKey = (spokeId: number, hubId: number, asset: string) =>
  `${spokeId}:${hubId}:${asset}`

interface XoxnoMarket {
  detail: XoxnoReserve
  meta: XoxnoMeta
  asset: SupplyProduct['asset']
  price: number | null
  supply: boolean
  borrow: boolean
}

function buildMarkets(
  client: XoxnoClient,
  context: XoxnoContext,
  assets: LendingAsset[],
  prices: Awaited<ReturnType<XoxnoClient['detailedMarkets']>>
): XoxnoMarket[] {
  const tokens = new Map(context.assets.map((x) => [x.asset, x]))
  const hubs = new Map(context.hubs.map((x) => [x.hubId, x]))
  const spokeNames = new Map(context.spokes.map((x) => [x.spokeId, x.name]))
  const marketPrices = new Map(
    prices.map((x) => [marketKey(x.hubId, x.asset), x])
  )
  const sdkAssets = new Map<string, LendingAsset>()
  for (const asset of assets) {
    const key = marketKey(asset.hubId, asset.sac)
    const existing = sdkAssets.get(key)
    if (!existing) sdkAssets.set(key, asset)
    else {
      const spokes = new Map(existing.spokes.map((x) => [x.spokeId, x]))
      for (const spoke of asset.spokes) spokes.set(spoke.spokeId, spoke)
      sdkAssets.set(key, { ...existing, spokes: [...spokes.values()] })
    }
  }
  const grouped = new Map<string, XoxnoReserve[]>()
  for (const reserve of context.reserves) {
    const detail =
      context.reserveDetailsByKey[
        reserveKey(reserve.spokeId, reserve.hubId, reserve.asset)
      ]
    if (
      !detail ||
      detail.spokeId !== reserve.spokeId ||
      detail.hubId !== reserve.hubId ||
      detail.asset !== reserve.asset ||
      !tokens.has(reserve.asset) ||
      !hubs.has(reserve.hubId) ||
      !spokeNames.has(reserve.spokeId)
    ) {
      throw new Error(
        `Incomplete XOXNO discovery: ${reserveKey(reserve.spokeId, reserve.hubId, reserve.asset)}`
      )
    }
    const key = marketKey(reserve.hubId, reserve.asset)
    const entries = grouped.get(key) ?? []
    if (entries.some((x) => x.spokeId === reserve.spokeId)) {
      throw new Error(`Duplicate XOXNO reserve: ${key}`)
    }
    entries.push(detail)
    grouped.set(key, entries)
  }
  const collateralFor = (spokeId: number): XoxnoCollateral[] =>
    [...grouped.values()]
      .flat()
      .filter(
        (x) =>
          x.spokeId === spokeId && x.isCollateralizable && x.useAsCollateral
      )
      .map((x) => {
        const token = tokens.get(x.asset)!
        const sdk = sdkAssets.get(marketKey(x.hubId, x.asset))
        const spoke = sdk?.spokes.find((s) => s.spokeId === spokeId)
        return {
          hubId: x.hubId,
          asset: x.asset,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoUrl: sdk?.logoUrl ?? null,
          ltv:
            Math.min(x.collateralFactorBps, x.liquidationThresholdBps) / 10_000,
          lltv: x.liquidationThresholdBps / 10_000,
          canBeCollateral: spoke?.canBeCollateral ?? false,
          canSupply: spoke?.canSupply ?? false,
          supplyCapacity: spoke?.supplyCapacity ?? null,
          paused: x.paused,
          frozen: x.frozen,
          noSeize: x.noSeize,
        }
      })
  return [...grouped.entries()].map(([key, reserves]) => {
    reserves.sort((a, b) => a.spokeId - b.spokeId)
    const detail = reserves[0]
    const sdk = sdkAssets.get(key)
    const token = tokens.get(detail.asset)!
    const spokes: XoxnoSpoke[] = reserves.map((x) => {
      const spoke = sdk?.spokes.find((s) => s.spokeId === x.spokeId)
      return {
        spokeId: x.spokeId,
        spokeName:
          spoke?.spokeName || spokeNames.get(x.spokeId) || `Spoke ${x.spokeId}`,
        canSupply: spoke?.canSupply ?? false,
        canBeCollateral: spoke?.canBeCollateral ?? false,
        canBorrow: spoke?.canBorrow ?? false,
        canOpenAccount: spoke?.canOpenAccount ?? false,
        supplyCapacity: spoke?.supplyCapacity ?? null,
        borrowCapacity: spoke?.borrowCapacity ?? null,
        ltv:
          Math.min(x.collateralFactorBps, x.liquidationThresholdBps) / 10_000,
        lltv: x.liquidationThresholdBps / 10_000,
        paused: x.paused,
        frozen: x.frozen,
        noSeize: x.noSeize,
        collaterals: collateralFor(x.spokeId),
      }
    })
    const price = marketPrices.get(key)
    return {
      detail,
      meta: {
        network: client.deployment.network,
        controller: client.deployment.controller,
        pool: client.deployment.pool,
        nft: client.deployment.nft,
        hubId: detail.hubId,
        asset: detail.asset,
        hubName:
          sdk?.hubName || hubs.get(detail.hubId)?.name || `Hub ${detail.hubId}`,
        historySpokeId: detail.spokeId,
        logoUrl: sdk?.logoUrl ?? null,
        spokes,
      },
      asset: {
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        address: token.asset,
      },
      price:
        price?.valid &&
        !price.stale &&
        !price.deviation &&
        price.usdPriceShort > 0
          ? price.usdPriceShort
          : null,
      supply: reserves.some((x) => x.isCollateralizable),
      borrow: reserves.some((x) => x.isBorrowable),
    }
  })
}

function product(market: XoxnoMarket, kind: 'supply' | 'borrow'): XoxnoProduct {
  const now = new Date()
  const base = {
    _id: xoxnoProductId({ ...market.meta, kind }),
    active: true,
    createdAt: now,
    updatedAt: now,
    asset: market.asset,
    protocol: {
      provider: XOXNO_PROVIDER,
      version: 'v1',
      type: 'reserve' as const,
      name: market.meta.hubName,
      subgraphUrl: '',
      chain: { id: XOXNO_CHAIN_ID, name: 'stellar' },
      address: market.meta.controller,
      meta: market.meta,
    },
  }
  if (kind === 'supply') return { ...base, kind }
  const unique = new Map<string, Collateral>()
  for (const spoke of market.meta.spokes)
    for (const collateral of spoke.collaterals) {
      const key = `${collateral.hubId}:${collateral.asset}`
      unique.set(key, {
        address: collateral.asset,
        symbol: collateral.symbol,
        name: collateral.name,
        decimals: collateral.decimals,
        ltv: null,
        lltv: null,
        canBeCollateral: false,
      })
    }
  return { ...base, kind, collaterals: [...unique.values()] }
}

/** Undo daily compounding before applying utilization; API supply APY is already net. */
export function xoxnoSupplyBreakdown(
  net: number,
  borrow: number | null,
  utilization: number | null
) {
  const base =
    borrow === null || utilization === null
      ? null
      : Math.expm1(
          365 * Math.log1p(Math.expm1(Math.log1p(borrow) / 365) * utilization)
        )
  return {
    base,
    rewards: 0,
    fees: base === null ? null : base - net,
    net,
    rewardItems: [],
  }
}

export function createXoxnoYieldReads(client: XoxnoClient = xoxnoClient) {
  const marketsOnce = dedupeInFlight(
    () => '',
    async () => {
      const [context, collateral, borrow, prices] = await Promise.all([
        client.context(),
        client.assets('collateral'),
        client.assets('borrow'),
        client.detailedMarkets(),
      ])
      return buildMarkets(client, context, [...collateral, ...borrow], prices)
    }
  )
  const included = (opts?: FetchOpts) =>
    !opts?.chainIds || opts.chainIds.includes(XOXNO_CHAIN_ID)
  return {
    async getProducts(opts?: FetchOpts): Promise<XoxnoProduct[]> {
      if (!included(opts)) return []
      const markets = await marketsOnce()
      return markets.flatMap((m) => [
        ...(m.supply ? [product(m, 'supply')] : []),
        ...(m.borrow ? [product(m, 'borrow')] : []),
      ])
    },
    async getApySpot(opts?: FetchOpts): Promise<SpotPayload[]> {
      if (!included(opts)) return []
      const markets = await marketsOnce()
      return markets.flatMap((m): SpotPayload[] => {
        const d = m.detail
        const usd = (amount: number | null) =>
          m.price === null || amount === null ? null : amount * m.price
        const shared = {
          supplyAssets: d.hubPool.suppliedShort,
          supplyAssetsUsd: usd(d.hubPool.suppliedShort),
          utilizationRate: d.utilization,
          assetPriceUsd: m.price,
          availableLiquidity: d.availableLiquidityShort,
          availableLiquidityUsd: usd(d.availableLiquidityShort),
        }
        const common = {
          protocol: XOXNO_PROVIDER,
          chainId: XOXNO_CHAIN_ID,
          asset: m.asset.symbol,
        }
        return [
          ...(m.supply && d.supplyApy !== null
            ? [
                {
                  ...common,
                  productId: xoxnoProductId({ ...m.meta, kind: 'supply' }),
                  kind: 'supply' as const,
                  apy: xoxnoSupplyBreakdown(
                    d.supplyApy,
                    d.borrowApy,
                    d.utilization
                  ),
                  market: shared,
                },
              ]
            : []),
          ...(m.borrow && d.borrowApy !== null
            ? [
                {
                  ...common,
                  productId: xoxnoProductId({ ...m.meta, kind: 'borrow' }),
                  kind: 'borrow' as const,
                  apy: {
                    base: d.borrowApy,
                    rewards: 0,
                    fees: 0,
                    net: d.borrowApy,
                    rewardItems: [],
                  },
                  market: {
                    ...shared,
                    borrowAssets: d.hubPool.borrowedShort,
                    borrowAssetsUsd: usd(d.hubPool.borrowedShort),
                    collateralAssetsUsd: null,
                    priceCollateralInLoanAsset: null,
                  },
                },
              ]
            : []),
        ]
      })
    },
  }
}

const reads = createXoxnoYieldReads()
export const fetchXoxnoProducts = reads.getProducts
export const fetchXoxnoApySpot = reads.getApySpot
