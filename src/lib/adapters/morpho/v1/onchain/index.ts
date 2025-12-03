import type { DataAdapter } from '@/lib/adapters/types'
import { MarketRate, TimeframeLabel } from '@/types'

import {
  type BaseChainClient,
  createChainRegistry,
  createGraphQLClient,
} from '../../../shared'
import { MORPHO_CONFIG } from '../../config'
import {
  MarketDailyRatesQuery,
  MarketHourlyRatesQuery,
} from './generated/graphql'
import { MARKET_DAILY_RATES, MARKET_HOURLY_RATES } from './queries'

// ============================================================================
// Types
// ============================================================================

/**
 * Type for chain-specific data transformers.
 * Allows chains with different schemas to provide custom transformation logic.
 */
export type ChainTransformers = {
  getMarketBorrowHistoryRates?: (
    data: unknown,
    protocolId: string
  ) => MarketRate[]
  getMarketLendHistoryRates?: (
    data: unknown,
    protocolId: string
  ) => MarketRate[]
}

/**
 * Morpho V1 chain client configuration type.
 */
export type ChainClient = BaseChainClient<undefined, ChainTransformers>

// ============================================================================
// Chain Registry
// ============================================================================

/**
 * Chain registry for Morpho V1 onchain adapter.
 * Manages multi-chain subgraph clients with lazy initialization.
 */
const chainRegistry = createChainRegistry<ChainClient>(
  () => MORPHO_CONFIG.morpho_v1.chains,
  { protocolName: 'Morpho V1' }
)

/**
 * Chain importer for dynamic imports relative to this folder.
 */
const chainImporter = (path: string) => import(`./${path}`)

/**
 * Register a chain client. Called by each chain folder during initialization.
 */
export const registerChain = chainRegistry.registerChain

/**
 * Get a specific chain client by chain ID.
 */
const getChainClient = (chainId: number) =>
  chainRegistry.getChainClient(chainId, chainImporter)

/**
 * Re-export createSubgraphClient as createChainClient for backward compatibility
 * with existing chain folder implementations.
 */
export { createGraphQLClient as createChainClient }

async function getMarketBorrowHistoryRates({
  chainId,
  poolId,
  interval,
  fromTimestamp,
}: {
  chainId: number
  poolId: string
  interval: TimeframeLabel
  fromTimestamp: number
}): Promise<MarketRate[]> {
  if (!poolId || !interval || !fromTimestamp) {
    return []
  }

  try {
    const chainClient = await getChainClient(chainId)
    if (!chainClient) {
      return []
    }
    const { chainName, client } = chainClient

    const isDaily = true
    const where = { market: poolId, timestamp_gte: fromTimestamp }

    if (isDaily) {
      const { data, error } = await client
        .query<MarketDailyRatesQuery>(MARKET_DAILY_RATES, {
          where,
          side: 'BORROWER',
        })
        .toPromise()

      if (error) {
        console.error(
          `Failed to fetch ${chainName} Morpho V1 daily borrow rates:`,
          error
        )
        if (error.message?.includes('Time-out') || error.networkError) {
          console.warn(
            `${chainName} Morpho V1 API timeout - returning empty rates`
          )
        }
        return []
      }

      return (
        data?.marketDailySnapshots?.map((snapshot) => ({
          timestamp: Number(snapshot.timestamp),
          rate: Number(snapshot.rates?.[0].rate ?? '0'),
        })) ?? []
      )
    }

    const { data, error } = await client
      .query<MarketHourlyRatesQuery>(MARKET_HOURLY_RATES, { where })
      .toPromise()

    if (error) {
      console.error(
        `Failed to fetch ${chainName} Morpho V1 hourly borrow rates:`,
        error
      )
      if (error.message?.includes('Time-out') || error.networkError) {
        console.warn(
          `${chainName} Morpho V1 API timeout - returning empty rates`
        )
      }
      return []
    }

    return (
      data?.marketHourlySnapshots?.map((snapshot) => ({
        timestamp: Number(snapshot.timestamp),
        rate: Number(snapshot.rates?.[0].rate ?? '0'),
      })) ?? []
    )
  } catch (err) {
    console.error(
      'Unexpected error fetching Morpho V1 market borrow rates:',
      err
    )
    return []
  }
}

async function getMarketLendHistoryRates() {
  return []
}
export const morphoV1OnchainAdapter: DataAdapter = {
  dataSourceType: 'onchain',
  getMarketBorrowHistoryRates,
  getMarketLendHistoryRates,
}
