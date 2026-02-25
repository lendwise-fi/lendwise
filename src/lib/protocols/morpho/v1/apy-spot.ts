import { ApyTimeSeriesDocument } from '@/lib/db/types'
import { MORPHO_CONFIG } from '@/lib/protocols/morpho/config'
import { MARKETS_APY } from '@/lib/protocols/morpho/v1/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'

type MarketsApyQuery = {
  markets: {
    items: {
      uniqueKey: string
      loanAsset: {
        symbol: string
        chain: { id: number; network: string }
      }
      collateralAsset: { symbol: string } | null
      state: {
        borrowApy: number | null
        netBorrowApy: number | null
        supplyApy: number | null
        netSupplyApy: number | null
      } | null
    }[]
    pageInfo: { countTotal: number; count: number }
  }
}

/**
 * Fetch current APY for all Morpho markets (both supply via vaults and borrow via markets).
 *
 * Morpho has a dual structure:
 * - Vaults: lending side (supply APY)
 * - Markets: borrowing side (borrow APY) + direct supply APY
 *
 * For the cron, we collect per-market (loan asset) APY from the markets endpoint,
 * which provides both supplyApy and borrowApy at the market level.
 */
export async function fetchMorphoV1Apy(
  chainFilter?: string
): Promise<ApyTimeSeriesDocument[]> {
  const config = MORPHO_CONFIG.morpho_v1
  const client = createGraphQLClient(config.offchainApiUrl!)

  let chainIds = Object.keys(config.chains).map(Number)

  // Filter chainIds if a specific chain is requested
  if (chainFilter) {
    const chainId = Object.entries(config.chains).find(
      ([, chainConfig]) =>
        chainConfig.name.toLowerCase() === chainFilter.toLowerCase()
    )?.[0]

    if (chainId) {
      chainIds = [Number(chainId)]
    } else {
      console.warn(
        `[cron:morpho] Chain filter '${chainFilter}' not found in config`
      )
      return []
    }
  }

  const snapshots: ApyTimeSeriesDocument[] = []
  const timestamp = new Date()

  // Fetch market-level APY (has both supply and borrow)
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

    if (!data?.markets?.items?.length) {
      break
    }

    for (const market of data.markets.items) {
      const chain = market.loanAsset.chain.network.toLowerCase()
      const collateralSymbol = market.collateralAsset?.symbol ?? 'NONE'
      const marketLabel = `${market.loanAsset.symbol}/${collateralSymbol}`

      const supplyApy =
        market.state?.netSupplyApy ?? market.state?.supplyApy ?? 0
      const borrowApy =
        market.state?.netBorrowApy ?? market.state?.borrowApy ?? 0

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
            symbol: marketLabel,
            name: marketLabel,
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

    if (data.markets.pageInfo.countTotal > skip + data.markets.pageInfo.count) {
      skip += data.markets.pageInfo.count
    } else {
      hasMore = false
    }
  }

  console.log(`[cron:morpho] Fetched ${snapshots.length} APY snapshots`)
  return snapshots
}
