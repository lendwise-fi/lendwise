import { ApyTimeSeriesDocument } from '@/lib/db/types'
import { COMPOUND_CONFIG } from '@/lib/protocols/compound/config'
import { MarketsApyQuery } from '@/lib/protocols/compound/v3/onchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/compound/v3/onchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'

/**
 * Map Compound subgraph network enum to our chain naming.
 */
const NETWORK_TO_CHAIN: Record<string, string> = {
  MAINNET: 'ethereum',
  ARBITRUM_ONE: 'arbitrum',
  MATIC: 'polygon',
  OPTIMISM: 'optimism',
  BASE: 'base',
}

/**
 * Fetch current supply and borrow APY for all Compound V3 markets across all chains.
 *
 * Compound uses on-chain subgraphs per chain, so we query each chain's subgraph
 * independently and aggregate the results.
 */
export async function fetchCompoundV3Apy(
  chainFilter?: string
): Promise<ApyTimeSeriesDocument[]> {
  const config = COMPOUND_CONFIG.compound_v3
  const snapshots: ApyTimeSeriesDocument[] = []

  let chainEntries = Object.entries(config.chains).filter(
    ([, chainConfig]) => chainConfig.custom?.subgraphUrl
  )

  // Filter chains if specific one requested
  if (chainFilter) {
    const filtered = chainEntries.filter(
      ([, chainConfig]) =>
        chainConfig.name.toLowerCase() === chainFilter.toLowerCase()
    )

    if (filtered.length > 0) {
      chainEntries = filtered
    } else {
      // If chain supported by config but not in the subgraph list, just return empty
      // (or if valid chain doesn't exist at all)
      console.warn(
        `[cron:compound] Chain filter '${chainFilter}' not found or has no subgraph`
      )
      return []
    }
  }

  const results = await Promise.allSettled(
    chainEntries.map(async ([, chainConfig]) => {
      const subgraphUrl = chainConfig.custom.subgraphUrl!
      const apiKey = process.env.THEGRAPH_API_KEY

      const url = apiKey
        ? subgraphUrl.replace(
            '/api/subgraphs/id/',
            `/api/${apiKey}/subgraphs/id/`
          )
        : subgraphUrl

      const client = createGraphQLClient(url)

      const { data, error } = await client
        .query<MarketsApyQuery>(MARKETS_APY, {})
        .toPromise()

      if (error) {
        console.error(
          `[cron:compound] Failed to fetch ${chainConfig.name} rates:`,
          error.message
        )
        return []
      }

      if (!data?.markets) {
        return []
      }

      const snapshots: ApyTimeSeriesDocument[] = []
      const timestamp = new Date()

      for (const market of data.markets) {
        const network = market.protocol.network
        const chain = NETWORK_TO_CHAIN[network] ?? network.toLowerCase()

        let supplyApy = 0
        let borrowApy = 0

        for (const rate of market.rates || []) {
          if (rate.side === 'LENDER') {
            supplyApy = parseFloat(rate.rate)
          } else if (rate.side === 'BORROWER') {
            borrowApy = parseFloat(rate.rate)
          }
        }

        const borrowAssets = 0
        const borrowAssetsUsd = 0
        const supplyAssets = 0
        const supplyAssetsUsd = 0
        const collateralAssets = 0
        const collateralAssetsUsd = 0

        snapshots.push({
          timestamp,
          metadata: {
            protocol: {
              name: config.id,
              address: '',
            },
            chain: {
              id: 0,
              name: chain,
            },
            vault: {
              symbol: market.name || '',
              name: market.name || '',
              address: '',
            },
          },
          supplyApy: {
            native: supplyApy,
            rewards: 0,
            fees: 0,
            total: supplyApy,
          },
          borrowApy: {
            native: borrowApy,
            rewards: 0,
            fees: 0,
            total: borrowApy,
          },
          supplyAssets,
          supplyAssetsUsd,
          borrowAssets,
          borrowAssetsUsd,
          collateralAssets,
          collateralAssetsUsd,
        })
      }
      return snapshots
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      snapshots.push(...result.value)
    }
  }

  console.log(`[cron:compound] Fetched ${snapshots.length} APY snapshots`)
  return snapshots
}
