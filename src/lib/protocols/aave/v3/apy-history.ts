import type { ApyBreakdown, BorrowMarketState, SupplyMarketState } from '@/lib/db/types'
import { AAVE_CONFIG } from '@/lib/protocols/aave/config'
import { APY_HISTORY, MARKETS_WITH_TOKENS } from '@/lib/protocols/aave/v3/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'
import { CHAIN_NAME_MAPPING } from '@/lib/protocols/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

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

export type HistoryDataPoint = {
  timestamp: Date
  productId: string
  kind: 'supply' | 'borrow'
  apy: ApyBreakdown
  market: SupplyMarketState | BorrowMarketState
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildProductId(
  chainId: number,
  tokenAddress: string,
  kind: 'supply' | 'borrow'
): string {
  const network = CHAIN_NAME_MAPPING[chainId] ?? String(chainId)
  return `aave:v3:${network}:reserve:${tokenAddress.toLowerCase()}:${kind}`
}

function emptySupplyMarket(): SupplyMarketState {
  return { supplyAssets: 0, supplyAssetsUsd: 0, utilizationRate: 0, assetPriceUsd: 0 }
}

function emptyBorrowMarket(): BorrowMarketState {
  return {
    supplyAssets: 0,
    supplyAssetsUsd: 0,
    borrowAssets: 0,
    borrowAssetsUsd: 0,
    utilizationRate: 0,
    assetPriceUsd: 0,
    collateralAssetsUsd: null,
    priceCollateralInLoanAsset: null,
  }
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Fetch historical AAVE v3 APY data.
 *
 * Uses the AAVE offchain GraphQL API which supports up to LAST_YEAR window.
 * Returns daily data points with supply and borrow APY per reserve.
 */
export async function fetchAaveHistory(opts?: {
  chainFilter?: string
  onProgress?: (msg: string) => void
}): Promise<HistoryDataPoint[]> {
  const log = opts?.onProgress ?? console.log
  const config = AAVE_CONFIG.aave_v3
  const client = createGraphQLClient(config.offchainApiUrl!)
  let chainIds = Object.keys(config.chains).map(Number)

  if (opts?.chainFilter) {
    const found = Object.entries(config.chains).find(
      ([, c]) => c.name.toLowerCase() === opts.chainFilter!.toLowerCase()
    )
    if (!found) {
      log(`[history:aave] Chain filter '${opts.chainFilter}' not found`)
      return []
    }
    chainIds = [Number(found[0])]
  }

  // Step 1: List all markets and their reserves
  const { data: marketsData, error: marketsError } = await client
    .query<MarketsWithTokensQuery>(MARKETS_WITH_TOKENS, {
      request: { chainIds },
    })
    .toPromise()

  if (marketsError || !marketsData?.markets) {
    throw new Error(`[history:aave] Failed to list markets: ${marketsError?.message ?? 'No data'}`)
  }

  type ReserveInfo = {
    marketAddress: string
    chainId: number
    chainName: string
    tokenAddress: string
    tokenSymbol: string
  }

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

  log(`[history:aave] Found ${reserves.length} reserves across ${marketsData.markets.length} markets`)

  // Step 2: Fetch history for each reserve sequentially
  const allPoints: HistoryDataPoint[] = []

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
        log(`[history:aave] ${reserve.tokenSymbol}@${reserve.chainName}: ${error.message}`)
        continue
      }

      // Build date → { supplyApy, borrowApy } map
      const dateMap = new Map<string, { supplyApy: number; borrowApy: number }>()

      for (const entry of data?.supplyAPYHistory ?? []) {
        const existing = dateMap.get(entry.date) ?? { supplyApy: 0, borrowApy: 0 }
        existing.supplyApy = entry.avgRate.value
        dateMap.set(entry.date, existing)
      }

      for (const entry of data?.borrowAPYHistory ?? []) {
        const existing = dateMap.get(entry.date) ?? { supplyApy: 0, borrowApy: 0 }
        existing.borrowApy = entry.avgRate.value
        dateMap.set(entry.date, existing)
      }

      const supplyProductId = buildProductId(reserve.chainId, reserve.tokenAddress, 'supply')
      const borrowProductId = buildProductId(reserve.chainId, reserve.tokenAddress, 'borrow')

      for (const [date, rates] of dateMap) {
        const timestamp = new Date(date)

        // Supply point
        allPoints.push({
          timestamp,
          productId: supplyProductId,
          kind: 'supply',
          apy: {
            base: rates.supplyApy,
            rewards: 0,
            fees: 0,
            net: rates.supplyApy,
            rewardItems: [],
          },
          market: emptySupplyMarket(),
        })

        // Borrow point
        allPoints.push({
          timestamp,
          productId: borrowProductId,
          kind: 'borrow',
          apy: {
            base: rates.borrowApy,
            rewards: 0,
            fees: 0,
            net: rates.borrowApy,
            rewardItems: [],
          },
          market: emptyBorrowMarket(),
        })
      }

      log(`[history:aave] ${reserve.tokenSymbol}@${reserve.chainName}: ${dateMap.size} days`)
    } catch (err) {
      log(
        `[history:aave] ${reserve.tokenSymbol}@${reserve.chainName}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  log(`[history:aave] Total: ${allPoints.length} data points`)
  return allPoints
}

// Re-export for backwards compatibility
export { fetchAaveHistory as syncAaveHistory }
