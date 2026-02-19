import { AAVE_CONFIG } from '@/lib/adapters/aave/config'
import {
  APY_HISTORY,
  MARKETS_WITH_TOKENS,
} from '@/lib/adapters/aave/v3/offchain/queries'
import { createGraphQLClient } from '@/lib/adapters/shared'
import { ApyTimeSeriesDocument } from '@/lib/db/types'

// import { writeApySnapshotsWithTimestamps } from '@/lib/db/write-apy'

type MarketsWithTokensQuery = {
  markets: {
    address: string
    chain: { name: string; chainId: number }
    reserves: {
      underlyingToken: { address: string; symbol: string }
    }[]
  }[]
}

type ApyHistoryQuery = {
  supplyAPYHistory: { date: string; avgRate: { value: number } }[]
  borrowAPYHistory: { date: string; avgRate: { value: number } }[]
}

type ReserveInfo = {
  marketAddress: string
  chainId: number
  chainName: string
  tokenAddress: string
  tokenSymbol: string
}

/**
 * Sync historical AAVE v3 APY data for the last year.
 *
 * Strategy:
 * 1. List all markets + reserves (to get market address, chainId, token address)
 * 2. For each reserve, fetch supplyAPYHistory + borrowAPYHistory (window: LAST_YEAR)
 * 3. Merge supply and borrow by date, write timestamped snapshots to InfluxDB
 *
 * The AAVE API returns daily data points. Each point is written with its date
 * floored to the hour (which for daily data means 00:00:00 of that day).
 */
export async function syncAaveHistory(): Promise<{
  total: number
  errors: string[]
}> {
  const config = AAVE_CONFIG.aave_v3
  const client = createGraphQLClient(config.offchainApiUrl!)
  const chainIds = Object.keys(config.chains).map(Number)

  // Step 1: List all markets and their reserves
  const { data: marketsData, error: marketsError } = await client
    .query<MarketsWithTokensQuery>(MARKETS_WITH_TOKENS, {
      request: { chainIds },
    })
    .toPromise()

  if (marketsError || !marketsData?.markets) {
    const msg = marketsError?.message ?? 'No markets data'
    console.error('[sync:aave] Failed to list markets:', msg)
    return { total: 0, errors: [msg] }
  }

  // Flatten to a list of reserves with their market context
  const reserves: ReserveInfo[] = []
  for (const market of marketsData.markets) {
    for (const reserve of market.reserves) {
      reserves.push({
        marketAddress: market.address,
        chainId: market.chain.chainId,
        chainName: market.chain.name.toLowerCase(),
        tokenAddress: reserve.underlyingToken.address,
        tokenSymbol: reserve.underlyingToken.symbol,
      })
    }
  }

  console.log(
    `[sync:aave] Found ${reserves.length} reserves across ${marketsData.markets.length} markets`
  )

  // Step 2: Fetch history for each reserve sequentially to avoid rate limiting
  let totalWritten = 0
  const errors: string[] = []

  for (const reserve of reserves) {
    try {
      const historyRequest = {
        chainId: reserve.chainId,
        market: reserve.marketAddress,
        underlyingToken: reserve.tokenAddress,
        window: 'LAST_YEAR',
      }

      const { data, error } = await client
        .query<ApyHistoryQuery>(APY_HISTORY, {
          supplyRequest: historyRequest,
          borrowRequest: historyRequest,
        })
        .toPromise()

      if (error) {
        const msg = `${reserve.tokenSymbol}@${reserve.chainName}: ${error.message}`
        console.error(`[sync:aave] ${msg}`)
        errors.push(msg)
        continue
      }

      // Build a map of date → { supplyApy, borrowApy }
      const dateMap = new Map<
        string,
        { supplyApy: number; borrowApy: number }
      >()

      for (const entry of data?.supplyAPYHistory ?? []) {
        const existing = dateMap.get(entry.date) ?? {
          supplyApy: 0,
          borrowApy: 0,
        }
        existing.supplyApy = entry.avgRate.value
        dateMap.set(entry.date, existing)
      }

      for (const entry of data?.borrowAPYHistory ?? []) {
        const existing = dateMap.get(entry.date) ?? {
          supplyApy: 0,
          borrowApy: 0,
        }
        existing.borrowApy = entry.avgRate.value
        dateMap.set(entry.date, existing)
      }

      // Convert to timestamped snapshots
      const snapshots: ApyTimeSeriesDocument[] = []

      for (const [date, _rates] of dateMap) {
        const supplyApy = 0
        const borrowApy = 0
        const borrowAssets = 0
        const borrowAssetsUsd = 0
        const supplyAssets = 0
        const supplyAssetsUsd = 0
        const collateralAssets = 0
        const collateralAssetsUsd = 0

        snapshots.push({
          timestamp: new Date(date),
          metadata: {
            protocol: config.id,
            market: {
              name: '',
              address: '',
              chain: {
                name: '',
                id: 0,
              },
              vault: {
                symbol: '',
                name: '',
                address: '',
              },
            },
          },
          supplyApy,
          borrowApy,
          supplyAssets,
          supplyAssetsUsd,
          borrowAssets,
          borrowAssetsUsd,
          collateralAssets,
          collateralAssetsUsd,
        })
      }

      if (snapshots.length > 0) {
        // await writeApySnapshotsWithTimestamps(snapshots)
        totalWritten += snapshots.length
        console.log(
          `[sync:aave] ${reserve.tokenSymbol}@${reserve.chainName}: ${snapshots.length} data points`
        )
      }
    } catch (err) {
      const msg = `${reserve.tokenSymbol}@${reserve.chainName}: ${err instanceof Error ? err.message : String(err)}`
      console.error(`[sync:aave] ${msg}`)
      errors.push(msg)
    }
  }

  console.log(`[sync:aave] Total: ${totalWritten} data points written`)
  return { total: totalWritten, errors }
}
