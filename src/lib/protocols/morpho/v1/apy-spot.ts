import type { SpotPayload, LendMarketState, BorrowMarketState } from '@/lib/db/types'
import { MORPHO_CONFIG } from '@/lib/protocols/morpho/config'
import type { MarketsApyQuery } from '@/lib/protocols/morpho/v1/offchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/morpho/v1/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'
import { aprToApyMorpho } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a deterministic pool _id slug.
 * Format: morpho-{market}-{loanSymbol}-{collateralSymbol?}-{kind}
 */
function buildPoolId(
  market:           string,
  loanSymbol:       string,
  kind:             'lend' | 'borrow',
  collateralSymbol?: string
): string {
  const base = `morpho-${market}-${loanSymbol.toLowerCase()}`
  if (kind === 'borrow' && collateralSymbol) {
    return `${base}-${collateralSymbol.toLowerCase()}-borrow`
  }
  return `${base}-${kind}`
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Fetch current APY snapshots for all active Morpho Blue markets.
 * Returns SpotPayload documents ready for hourly upsert.
 *
 * One market → two payloads (lend + borrow).
 */
export async function fetchMorphoV1ApySpot(
  chainFilter?: string
): Promise<SpotPayload[]> {
  const config = MORPHO_CONFIG.morpho_v1
  const client = createGraphQLClient(config.offchainApiUrl!)

  let chainIds = Object.keys(config.chains).map(Number)

  if (chainFilter) {
    const found = Object.entries(config.chains).find(
      ([, c]) => c.name.toLowerCase() === chainFilter.toLowerCase()
    )
    if (!found) {
      console.warn(`[cron:morpho] Chain filter '${chainFilter}' not found in config`)
      return []
    }
    chainIds = [Number(found[0])]
  }

  const payloads: SpotPayload[] = []
  let skip     = 0
  let hasMore  = true

  while (hasMore) {
    const { data, error } = await client
      .query<MarketsApyQuery>(MARKETS_APY, {
        first: 100,
        skip,
        where: {
          chainId_in:          chainIds,
          borrowAssetsUsd_gte: 10000,
        },
      })
      .toPromise()

    if (error) {
      console.error('[cron:morpho] Failed to fetch market APY:', error.message)
      break
    }

    if (!data?.markets?.items?.length) break

    for (const market of data.markets.items) {
      const state = market.state
      if (!state) continue

      const chainId    = market.loanAsset.chain.id
      const marketName = `MorphoBlue${market.loanAsset.chain.network}`
      const loanSymbol = market.loanAsset.symbol

      // ─── Rewards ──────────────────────────────────────────────────────────

      const lendRewardItems = state.rewards
        .filter((r): r is typeof r & { supplyApr: number } => r.supplyApr != null && r.supplyApr > 0)
        .map((r) => ({
          token:   { symbol: r.asset.symbol, address: r.asset.address },
          apr:     r.supplyApr,
          apy:     aprToApyMorpho(r.supplyApr),
          source:  'protocol' as const,
          program: null,
        }))

      const borrowRewardItems = state.rewards
        .filter((r): r is typeof r & { borrowApr: number } => r.borrowApr != null && r.borrowApr > 0)
        .map((r) => ({
          token:   { symbol: r.asset.symbol, address: r.asset.address },
          apr:     r.borrowApr,
          apy:     aprToApyMorpho(r.borrowApr),
          source:  'protocol' as const,
          program: null,
        }))

      const lendRewardsTotal   = lendRewardItems.reduce((s, r) => s + r.apy, 0)
      const borrowRewardsTotal = borrowRewardItems.reduce((s, r) => s + r.apy, 0)

      // ─── Market state ──────────────────────────────────────────────────────

      const supplyAssetsUsd = state.supplyAssetsUsd ?? 0
      const supplyAssets    = Number(state.supplyAssets ?? 0)
      const borrowAssetsUsd = state.borrowAssetsUsd ?? 0
      const borrowAssets    = Number(state.borrowAssets ?? 0)
      const utilizationRate = state.utilization ?? 0
      const assetPriceUsd   = supplyAssets > 0 ? supplyAssetsUsd / supplyAssets : 0

      const fee          = state.fee ?? 0
      const supplyApy    = state.supplyApy ?? 0
      const netSupplyApy = state.netSupplyApy ?? supplyApy
      const borrowApy    = state.borrowApy ?? 0
      const netBorrowApy = state.netBorrowApy ?? borrowApy

      // ─── Lend payload ──────────────────────────────────────────────────────

      const lendPoolId = buildPoolId(marketName, loanSymbol, 'lend')

      const lendPayload: SpotPayload = {
        poolId:   lendPoolId,
        kind:     'lend',
        protocol: 'morpho',
        chainId,
        asset:    loanSymbol,
        apy: {
          base:        supplyApy,
          rewards:     lendRewardsTotal,
          fees:        fee,
          net:         netSupplyApy,
          rewardItems: lendRewardItems,
        },
        market: {
          supplyAssets,
          supplyAssetsUsd,
          utilizationRate,
          assetPriceUsd,
        } as LendMarketState,
      }

      // ─── Borrow payload ────────────────────────────────────────────────────

      const collateralSymbol = market.collateralAsset?.symbol
      const borrowPoolId     = buildPoolId(marketName, loanSymbol, 'borrow', collateralSymbol)

      const borrowPayload: SpotPayload = {
        poolId:   borrowPoolId,
        kind:     'borrow',
        protocol: 'morpho',
        chainId,
        asset:    loanSymbol,
        apy: {
          base:        borrowApy,
          rewards:     borrowRewardsTotal,
          fees:        fee,
          net:         netBorrowApy,
          rewardItems: borrowRewardItems,
        },
        market: {
          supplyAssets,
          supplyAssetsUsd,
          borrowAssets,
          borrowAssetsUsd,
          utilizationRate,
          assetPriceUsd,
          collateralAssetsUsd:        null,   // not exposed in current query
          priceCollateralInLoanAsset: null,   // TODO: derive from collateral state
        } as BorrowMarketState,
      }

      payloads.push(lendPayload, borrowPayload)
    }

    const pageInfo = data.markets.pageInfo
    if (pageInfo && pageInfo.countTotal > skip + pageInfo.limit) {
      skip += pageInfo.limit
    } else {
      hasMore = false
    }
  }

  console.log(`[cron:morpho] Fetched ${payloads.length} payloads (${payloads.length / 2} markets)`)
  return payloads
}