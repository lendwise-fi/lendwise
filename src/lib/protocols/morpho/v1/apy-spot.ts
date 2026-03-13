import type { BorrowApySpot, LendApySpot } from '@/lib/db/types'
import { MORPHO_CONFIG } from '@/lib/protocols/morpho/config'
import type { MarketsApyQuery } from '@/lib/protocols/morpho/v1/offchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/morpho/v1/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'
import { aprToApyMorpho, normalizeSlotTimestamp } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a deterministic pool _id slug.
 * Format: morpho-{market}-{loanSymbol}-{collateralSymbol?}-{kind}
 */
function buildPoolId(
  market: string,
  loanSymbol: string,
  kind: 'lend' | 'borrow',
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
 * Returns LendApySpot and BorrowApySpot documents ready for MongoDB upsert.
 *
 * One market → two documents (lend + borrow).
 */
export async function fetchMorphoV1Apy(
  chainFilter?: string
): Promise<(LendApySpot | BorrowApySpot)[]> {
  const config = MORPHO_CONFIG.morpho_v1
  const client = createGraphQLClient(config.offchainApiUrl!)
  const timestamp = normalizeSlotTimestamp()
  const fetchedAt = new Date()

  let chainIds = Object.keys(config.chains).map(Number)

  if (chainFilter) {
    const found = Object.entries(config.chains).find(
      ([, c]) => c.name.toLowerCase() === chainFilter.toLowerCase()
    )
    if (!found) {
      console.warn(
        `[cron:morpho] Chain filter '${chainFilter}' not found in config`
      )
      return []
    }
    chainIds = [Number(found[0])]
  }

  const spots: (LendApySpot | BorrowApySpot)[] = []
  let skip = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await client
      .query<MarketsApyQuery>(MARKETS_APY, {
        first: 100,
        skip,
        where: {
          chainId_in: chainIds,
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

      const chain = {
        id: market.loanAsset.chain.id,
        name: market.loanAsset.chain.network.toLowerCase(),
      }

      // Market name — MorphoBlue{Network} e.g. MorphoBlueEthereum
      const marketName = `MorphoBlue${market.loanAsset.chain.network}`

      const asset = {
        symbol: market.loanAsset.symbol,
        name: market.loanAsset.name,
        address: market.loanAsset.address,
        decimals: market.loanAsset.decimals,
      }

      // ─── Rewards ────────────────────────────────────────────────────────────

      const lendRewardItems = state.rewards
        .filter(
          (r): r is typeof r & { supplyApr: number } =>
            r.supplyApr != null && r.supplyApr > 0
        )
        .map((r) => ({
          token: { symbol: r.asset.symbol, address: r.asset.address },
          apr: r.supplyApr,
          apy: aprToApyMorpho(r.supplyApr),
          source: 'protocol' as const,
          program: null,
        }))

      const borrowRewardItems = state.rewards
        .filter(
          (r): r is typeof r & { borrowApr: number } =>
            r.borrowApr != null && r.borrowApr > 0
        )
        .map((r) => ({
          token: { symbol: r.asset.symbol, address: r.asset.address },
          apr: r.borrowApr,
          apy: aprToApyMorpho(r.borrowApr),
          source: 'protocol' as const,
          program: null,
        }))

      const lendRewardsTotal = lendRewardItems.reduce((s, r) => s + r.apy, 0)
      const borrowRewardsTotal = borrowRewardItems.reduce(
        (s, r) => s + r.apy,
        0
      )

      // ─── Market state ────────────────────────────────────────────────────────

      const supplyAssetsUsd = state.supplyAssetsUsd ?? 0
      const borrowAssetsUsd = state.borrowAssetsUsd ?? 0
      const availableLiquidity = supplyAssetsUsd - borrowAssetsUsd
      const utilizationRate = state.utilization ?? 0
      const supplyAssetsRaw = Number(state.supplyAssets ?? 0)

      const assetPriceUsd =
        supplyAssetsRaw > 0 ? supplyAssetsUsd / supplyAssetsRaw : 0

      const fee = state.fee ?? 0
      const supplyApy = state.supplyApy ?? 0
      const netSupplyApy = state.netSupplyApy ?? supplyApy
      const borrowApy = state.borrowApy ?? 0
      const netBorrowApy = state.netBorrowApy ?? borrowApy

      // ─── Lend document ───────────────────────────────────────────────────────

      const lendPoolId = buildPoolId(marketName, asset.symbol, 'lend')

      const lendSpot: LendApySpot = {
        timestamp,
        meta: {
          poolId: lendPoolId,
          kind: 'lend',
          protocol: 'morpho',
          chain,
          asset,
        },
        apy: {
          base: supplyApy,
          rewards: lendRewardsTotal,
          fees: fee,
          net: netSupplyApy,
          rewardItems: lendRewardItems,
        },
        market: {
          supplyAssetsUsd,
          availableLiquidity,
          utilizationRate,
          assetPriceUsd,
        },
        quality: {
          status: 'ok',
          fetchedAt,
          revision: 1,
        },
      }

      // ─── Borrow document ─────────────────────────────────────────────────────

      const collateral = market.collateralAsset
      const borrowPoolId = buildPoolId(
        marketName,
        asset.symbol,
        'borrow',
        collateral?.symbol
      )

      // priceCollateralInLoanAsset — only for Morpho Blue (fixed pair)
      // Requires collateral volume data — not in current query, set null for now
      const priceCollateralInLoanAsset = null

      const borrowSpot: BorrowApySpot = {
        timestamp,
        meta: {
          poolId: borrowPoolId,
          kind: 'borrow',
          protocol: 'morpho',
          chain,
          asset,
        },
        apy: {
          base: borrowApy,
          rewards: borrowRewardsTotal,
          fees: fee,
          net: netBorrowApy,
          rewardItems: borrowRewardItems,
        },
        market: {
          supplyAssetsUsd,
          borrowAssetsUsd,
          availableLiquidity,
          utilizationRate,
          assetPriceUsd,
          collateralAssetsUsd: null, // not exposed in current query
          priceCollateralInLoanAsset,
        },
        quality: {
          status: 'ok',
          fetchedAt,
          revision: 1,
        },
      }

      spots.push(lendSpot, borrowSpot)
    }

    const pageInfo = data.markets.pageInfo
    if (pageInfo && pageInfo.countTotal > skip + pageInfo.limit) {
      skip += pageInfo.limit
    } else {
      hasMore = false
    }
  }

  console.log(
    `[cron:morpho] Fetched ${spots.length} spot documents (${spots.length / 2} markets)`
  )
  return spots
}
