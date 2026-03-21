import type {
  BorrowMarketState,
  SpotPayload,
  SupplyMarketState,
} from '@/lib/db/types'
import { MORPHO_CONFIG } from '@/lib/protocols/morpho/config'
import type {
  MarketsApyQuery,
  VaultsApyQuery,
} from '@/lib/protocols/morpho/v1/offchain/generated/graphql'
import {
  MARKETS_APY,
  VAULTS_APY,
} from '@/lib/protocols/morpho/v1/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'
import { aprToApyMorpho } from '@/lib/utils'

import { buildProductId } from './utils'

/**
 * Fetch current APY snapshots for Morpho.
 * - Supply snapshots → MetaMorpho vaults (VAULTS_APY)
 * - Borrow snapshots → Morpho Blue markets (MARKETS_APY)
 *
 * Returns SpotPayload documents ready for hourly upsert.
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
      console.warn(
        `[cron:morpho] Chain filter '${chainFilter}' not found in config`
      )
      return []
    }
    chainIds = [Number(found[0])]
  }

  const snapshots: SpotPayload[] = []

  // ─── Phase 1: Supply snapshots from MetaMorpho vaults ─────────────────────

  let skip = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await client
      .query<VaultsApyQuery>(VAULTS_APY, {
        first: 100,
        skip,
        where: {
          listed: true,
          chainId_in: chainIds,
          // totalAssetsUsd_gte: 10000,
        },
      })
      .toPromise()

    if (error) {
      throw new Error(
        `[cron:morpho] Failed to fetch vault APY: ${error.message}`
      )
    }

    if (!data?.vaults?.items?.length) break

    for (const vault of data.vaults.items) {
      const state = vault.state
      if (!state) continue

      const chainId = vault.asset.chain.id
      const assetSymbol = vault.asset.symbol
      const network = vault.asset.chain.network
        .toLowerCase()
        .replaceAll(' ', '')
      const productId = `metamorpho:v1:${network}:vault:${vault.address.toLowerCase()}`

      // ─── Rewards ────────────────────────────────────────────────────────────
      // APR per reward = annualised token amount per supplied token × reward price
      const rewardItems = (state.rewards ?? [])
        .map((r) => {
          const amountPerToken =
            Number(r.amountPerSuppliedToken) / Math.pow(10, r.asset.decimals)
          const apr = amountPerToken * (r.asset.priceUsd ?? 0)
          return {
            token: { symbol: r.asset.symbol, address: r.asset.address },
            apr,
            apy: aprToApyMorpho(apr),
            source: 'protocol' as const,
            program: null,
          }
        })
        .filter((r) => r.apr > 0)

      // Total rewards = net APY delta between net and net-excluding-rewards
      const rewardsTotal =
        (state.netApy ?? 0) - (state.netApyExcludingRewards ?? 0)

      // ─── Market state ────────────────────────────────────────────────────────
      const totalAssets = Number(state.totalAssets ?? 0)
      const totalAssetsUsd = state.totalAssetsUsd ?? 0
      const assetPriceUsd = totalAssets > 0 ? totalAssetsUsd / totalAssets : 0

      const supplyPayload: SpotPayload = {
        productId,
        kind: 'supply',
        protocol: 'morpho',
        chainId,
        asset: assetSymbol,
        apy: {
          base: state.apy ?? 0,
          rewards: rewardsTotal,
          fees: state.fee ?? 0,
          net: state.netApy ?? 0,
          rewardItems,
        },
        market: {
          supplyAssets: totalAssets,
          supplyAssetsUsd: totalAssetsUsd,
          utilizationRate: 0,
          assetPriceUsd,
        } as SupplyMarketState,
      }

      snapshots.push(supplyPayload)
    }

    const pageInfo = data.vaults.pageInfo
    if (pageInfo && pageInfo.countTotal > skip + pageInfo.limit) {
      skip += pageInfo.limit
    } else {
      hasMore = false
    }
  }

  // ─── Phase 2: Borrow snapshots from Morpho Blue markets ───────────────────

  skip = 0
  hasMore = true

  while (hasMore) {
    const { data, error } = await client
      .query<MarketsApyQuery>(MARKETS_APY, {
        first: 100,
        skip,
        where: {
          listed: true,
          chainId_in: chainIds,
          borrowAssetsUsd_gte: 10000,
        },
      })
      .toPromise()

    if (error) {
      throw new Error(
        `[cron:morpho] Failed to fetch market APY: ${error.message}`
      )
    }

    if (!data?.markets?.items?.length) break

    for (const market of data.markets.items) {
      const state = market.state
      if (!state) continue

      const chainId = market.loanAsset.chain.id
      const loanSymbol = market.loanAsset.symbol

      // ─── Rewards ────────────────────────────────────────────────────────────

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

      const borrowRewardsTotal = borrowRewardItems.reduce(
        (s, r) => s + r.apy,
        0
      )

      // ─── Market state ────────────────────────────────────────────────────────

      const supplyAssetsUsd = state.supplyAssetsUsd ?? 0
      const supplyAssets = Number(state.supplyAssets ?? 0)
      const borrowAssetsUsd = state.borrowAssetsUsd ?? 0
      const borrowAssets = Number(state.borrowAssets ?? 0)
      const utilizationRate = state.utilization ?? 0
      const assetPriceUsd =
        supplyAssets > 0 ? supplyAssetsUsd / supplyAssets : 0

      const fee = state.fee ?? 0
      const borrowApy = state.borrowApy ?? 0
      const netBorrowApy = state.netBorrowApy ?? borrowApy

      // ─── Borrow payload ──────────────────────────────────────────────────────
      const borrowProductId = buildProductId(market, 'borrow')
      const borrowPayload: SpotPayload = {
        productId: borrowProductId,
        kind: 'borrow',
        protocol: 'morpho',
        chainId,
        asset: loanSymbol,
        apy: {
          base: borrowApy,
          rewards: borrowRewardsTotal,
          fees: fee,
          net: netBorrowApy,
          rewardItems: borrowRewardItems,
        },
        market: {
          supplyAssets,
          supplyAssetsUsd,
          borrowAssets,
          borrowAssetsUsd,
          utilizationRate,
          assetPriceUsd,
          collateralAssetsUsd: null, // not exposed in current query
          priceCollateralInLoanAsset: null, // TODO: derive from collateral state
        } as BorrowMarketState,
      }

      snapshots.push(borrowPayload)
    }

    const pageInfo = data.markets.pageInfo
    if (pageInfo && pageInfo.countTotal > skip + pageInfo.limit) {
      skip += pageInfo.limit
    } else {
      hasMore = false
    }
  }

  const supplyCount = snapshots.filter((s) => s.kind === 'supply').length
  const borrowCount = snapshots.filter((s) => s.kind === 'borrow').length
  console.log(
    `[cron:morpho] Fetched ${snapshots.length} snapshots (${supplyCount} vaults, ${borrowCount} markets)`
  )
  return snapshots
}
