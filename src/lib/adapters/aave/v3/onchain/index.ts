import type { DataAdapter } from '@/lib/adapters/types'
import { MARKET_RATES_INTERVAL, MarketRate, MarketRateInterval } from '@/types'

import {
  type BaseChainClient,
  createChainRegistry,
  createGraphQLClient,
} from '../../../shared'
import { AAVE_CONFIG } from '../../config'
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
  getMarketBorrowRates?: (data: unknown, protocolId: string) => MarketRate[]
  getMarketLendRates?: (data: unknown, protocolId: string) => MarketRate[]
}

/**
 * Aave V3 chain client configuration type.
 */
export type ChainClient = BaseChainClient<undefined, ChainTransformers>

// ============================================================================
// Chain Registry
// ============================================================================

/**
 * Chain registry for Aave V3 onchain adapter.
 * Manages multi-chain subgraph clients with lazy initialization.
 */
const chainRegistry = createChainRegistry<ChainClient>(
  () => AAVE_CONFIG.aave_v3.chains,
  { protocolName: 'Aave V3' }
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

async function getMarketBorrowRates({
  chainId,
  poolId,
  interval,
  fromTimestamp,
}: {
  chainId: number
  poolId: string
  interval: MarketRateInterval
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

    const isDaily = interval === MARKET_RATES_INTERVAL.DAY
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
          `Failed to fetch ${chainName} Aave V3 daily borrow rates:`,
          error
        )
        if (error.message?.includes('Time-out') || error.networkError) {
          console.warn(
            `${chainName} Aave V3 API timeout - returning empty rates`
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
        `Failed to fetch ${chainName} Aave V3 hourly borrow rates:`,
        error
      )
      if (error.message?.includes('Time-out') || error.networkError) {
        console.warn(`${chainName} Aave V3 API timeout - returning empty rates`)
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
    console.error('Unexpected error fetching Aave V3 market borrow rates:', err)
    return []
  }
}

async function getMarketLendRates() {
  return []
}
export const aaveV3OnchainAdapter: DataAdapter = {
  dataSourceType: 'onchain',
  getMarketBorrowRates,
  getMarketLendRates,
}
