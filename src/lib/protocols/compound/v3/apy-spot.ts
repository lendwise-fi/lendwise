import type {
  BorrowMarketState,
  SpotPayload,
  SupplyMarketState,
} from '@/lib/db/types'
import { COMPOUND_CONFIG } from '@/lib/protocols/compound/config'
import { MarketsApyQuery } from '@/lib/protocols/compound/v3/onchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/compound/v3/onchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'

import { buildProductId } from './utils'

/**
 * Fetch current supply and borrow APY for all Compound V3 markets across all chains.
 *
 * Compound uses on-chain subgraphs per chain, so we query each chain's subgraph
 * independently and aggregate the results.
 */
export async function fetchCompoundV3ApySpot(
  chainFilter?: string
): Promise<SpotPayload[]> {
  const config = COMPOUND_CONFIG.compound_v3
  const snapshots: SpotPayload[] = []

  let chainIds = Object.keys(config.chains).map(Number)

  if (chainFilter) {
    const found = Object.entries(config.chains).find(
      ([, c]) => c.name.toLowerCase() === chainFilter.toLowerCase()
    )
    if (!found) {
      console.warn(
        `[products:compound] Chain filter '${chainFilter}' not found in config`
      )
      return []
    }
    chainIds = [Number(found[0])]
  }

  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const chainConfig = config.chains[chainId]
      if (!chainConfig?.custom.subgraphUrl) {
        console.warn(`[products:compound] No subgraph URL for chain ${chainId}`)
        return []
      }

      const chainClient = createGraphQLClient(
        chainConfig.custom.subgraphUrl,
        process.env.THEGRAPH_API_KEY
      )

      const { data, error } = await chainClient
        .query<MarketsApyQuery>(MARKETS_APY, {})
        .toPromise()

      if (error) {
        throw new Error(
          `[cron:compound] Failed to fetch ${chainConfig.name} rates: ${error.message}`
        )
      }

      if (!data?.markets?.length) {
        return []
      }

      const chain = {
        id: chainId,
        name: chainConfig.name.toLowerCase(),
      }

      for (const market of data.markets) {
        // ─── Supply payload ──────────────────────────────────────────────────────
        const supplyProductId = buildProductId(market.id, chain, 'supply')
        const supplyPayload: SpotPayload = {
          productId: supplyProductId,
          kind: 'supply',
          protocol: 'compound',
          chainId,
          asset: market.configuration.symbol,
          apy: {
            base: Number(market.accounting.supplyApr),
            rewards: Number(market.accounting.rewardSupplyApr),
            fees: 0,
            net: Number(market.accounting.netSupplyApr),
            rewardItems: [],
          },
          market: {
            supplyAssets: Number(market.accounting.totalBaseSupply),
            supplyAssetsUsd: Number(market.accounting.totalBaseSupplyUsd),
            utilizationRate: Number(market.accounting.utilization),
            assetPriceUsd: Number(market.configuration.baseToken.lastPriceUsd),
          } as SupplyMarketState,
        }

        // ─── Borrow payload ────────────────────────────────────────────────────
        const borrowProductId = buildProductId(market.id, chain, 'borrow')
        const borrowPayload: SpotPayload = {
          productId: borrowProductId,
          kind: 'borrow',
          protocol: 'compound',
          chainId,
          asset: market.configuration.symbol,
          apy: {
            base: Number(market.accounting.borrowApr),
            rewards: Number(market.accounting.rewardBorrowApr),
            fees: 0,
            net: Number(market.accounting.netBorrowApr),
            rewardItems: [],
          },
          market: {
            supplyAssets: Number(market.accounting.totalBaseSupply),
            supplyAssetsUsd: Number(market.accounting.totalBaseSupplyUsd),
            borrowAssets: Number(market.accounting.totalBaseBorrow),
            borrowAssetsUsd: Number(market.accounting.totalBaseBorrowUsd),
            utilizationRate: Number(market.accounting.utilization),
            assetPriceUsd: Number(market.configuration.baseToken.lastPriceUsd),
            collateralAssetsUsd: Number(market.accounting.collateralBalanceUsd),
            priceCollateralInLoanAsset: null, // TODO: derive from collateral state
          } as BorrowMarketState,
        }

        snapshots.push(supplyPayload, borrowPayload)
      }
      return snapshots
    })
  )

  const chainErrors: string[] = []
  for (const result of results) {
    if (result.status === 'rejected') {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      chainErrors.push(msg)
    } else {
      snapshots.push(...result.value)
    }
  }

  if (chainErrors.length > 0) {
    throw new Error(chainErrors.join(' | '))
  }

  console.log(`[cron:compound] Fetched ${snapshots.length} APY snapshots`)
  return snapshots
}
