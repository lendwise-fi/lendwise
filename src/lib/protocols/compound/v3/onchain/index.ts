import { type Address, formatUnits } from 'viem'
import { arbitrum, mainnet } from 'viem/chains'

import type { DataAdapter } from '@/lib/protocols/types'
import {
  BorrowPosition,
  LendPosition,
  MarketRate,
  TimeframeLabel,
} from '@/types'

import {
  type BaseChainClient,
  createChainRegistry,
  createGraphQLClient,
} from '../../../shared'
import { COMPOUND_CONFIG } from '../../config'
import type {
  MarketDailyBorrowRatesQuery,
  MarketDailyLendRatesQuery,
  MarketHourlyBorrowRatesQuery,
  MarketHourlyLendRatesQuery,
  UserBorrowPositionsQuery,
  UserLendPositionsQuery,
} from './generated/graphql'
import {
  MARKET_DAILY_BORROW_RATES,
  MARKET_DAILY_LEND_RATES,
  MARKET_HOURLY_BORROW_RATES,
  MARKET_HOURLY_LEND_RATES,
  USER_BORROW_POSITIONS,
  USER_LEND_POSITIONS,
} from './queries'

// ============================================================================
// Types
// ============================================================================

/**
 * Type for chain-specific queries.
 * Allows overriding default queries for chains with different schemas.
 */
export type ChainQueries = {
  USER_LEND_POSITIONS: typeof USER_LEND_POSITIONS
  USER_BORROW_POSITIONS: typeof USER_BORROW_POSITIONS
}

/**
 * Type for chain-specific data transformers.
 * Allows chains with different schemas to provide custom transformation logic.
 */
export type ChainTransformers = {
  getUserLendPositions?: (data: unknown, protocolId: string) => LendPosition[]
  getUserBorrowPositions?: (
    data: unknown,
    protocolId: string
  ) => BorrowPosition[]
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
 * Compound V3 chain client configuration type.
 */
export type ChainClient = BaseChainClient<ChainQueries, ChainTransformers>

// ============================================================================
// Chain Registry
// ============================================================================

/**
 * Chain registry for Compound V3 onchain adapter.
 * Manages multi-chain subgraph clients with lazy initialization.
 */
const chainRegistry = createChainRegistry<ChainClient>(
  () => COMPOUND_CONFIG.compound_v3.chains,
  { protocolName: 'Compound V3' }
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
 * Get all registered chain clients.
 */
const getChainClients = () => chainRegistry.getChainClients(chainImporter)

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

// ============================================================================
// Chain Name Mapping
// ============================================================================

/**
 * Maps Compound subgraph Network enum values to human-readable chain names.
 * Add entries as new chains are supported.
 */
const CHAIN_NAME_MAPPING: Record<
  string,
  { protocolName: string; marketSlug: string; chainId: number }
> = {
  MAINNET: {
    protocolName: 'ethereum',
    marketSlug: 'mainnet',
    chainId: mainnet.id,
  },
  ARBITRUM_ONE: {
    protocolName: 'arbitrum',
    marketSlug: 'arb',
    chainId: arbitrum.id,
  },
}

async function getUserLendPositions({
  addresses,
}: {
  addresses: Address[]
}): Promise<LendPosition[]> {
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    // Fetch positions from all registered chains in parallel
    const chainClients = await getChainClients()
    const results = await Promise.allSettled(
      chainClients.map(async ({ client, chainName, queries, transformers }) => {
        // Use chain-specific query if available, otherwise use default
        const query = queries?.USER_LEND_POSITIONS || USER_LEND_POSITIONS

        const { data, error } = await client
          .query<UserLendPositionsQuery>(query, {
            where: { id_in: addresses },
          })
          .toPromise()

        if (error) {
          console.error(
            `Failed to fetch ${chainName} Compound V3 positions:`,
            error
          )
          // Check if it's a timeout error
          if (error.message?.includes('Time-out') || error.networkError) {
            console.warn(
              `${chainName} Compound V3 API timeout - returning empty positions`
            )
          }
          return [] // Return what we have so far
        }

        // Use custom transformer if provided, otherwise use default logic
        if (transformers?.getUserLendPositions && data) {
          return transformers.getUserLendPositions(
            data,
            COMPOUND_CONFIG.compound_v3.id
          )
        }

        // Default transformation logic (Messari schema)
        return (
          data?.accounts?.flatMap((account) => {
            return account.positions
              .filter((position) => {
                // Only include supply positions (positive balance)
                const balance = BigInt(position.balance)
                return balance > 0n
              })
              .map((position): LendPosition => {
                // Convert balance from Wei to human-readable format
                const balanceInTokens = formatUnits(
                  BigInt(position.balance ?? 0),
                  position.asset.decimals
                )

                // Calculate USD value: balance * price
                const balanceUsd =
                  parseFloat(balanceInTokens) *
                  parseFloat(position.asset.lastPriceUSD ?? '0')

                return {
                  id: position.id,
                  protocol: COMPOUND_CONFIG.compound_v3.id,
                  userAddress: account.id.toLowerCase(),
                  poolName: position.market.name!,
                  poolAddress: position.market.relation,
                  poolId: position.market.relation,
                  poolChainId:
                    CHAIN_NAME_MAPPING[position.market.protocol.network]
                      ?.chainId ?? 1,
                  network:
                    CHAIN_NAME_MAPPING[position.market.protocol.network]
                      ?.protocolName ?? position.market.protocol.network,
                  assetAddress: position.asset.id as Address,
                  assetName: position.asset.name,
                  assetSymbol: position.asset.symbol,
                  assetDecimals: position.asset.decimals,
                  assetAmount: position.balance ?? 0,
                  assetAmountUsd: balanceUsd,
                  apy: position.market?.rates?.[0].rate ?? 0,
                  link: `https://app.compound.finance/?market=${position.asset.symbol.toLowerCase()}-${position.market.protocol.network.toLowerCase()}`,
                }
              })
          }) ?? []
        )
      })
    )

    // Aggregate results from all chains
    const allPositions = results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : []
    )

    return allPositions
  } catch (err) {
    console.error('Unexpected error fetching Compound V3 positions:', err)
    return []
  }
}

async function getUserBorrowPositions({
  addresses,
}: {
  addresses: Address[]
}): Promise<BorrowPosition[]> {
  if (!addresses || addresses.length === 0) {
    return []
  }

  try {
    // Fetch positions from all registered chains in parallel
    const chainClients = await getChainClients()
    const results = await Promise.allSettled(
      chainClients.map(async ({ client, chainName, queries, transformers }) => {
        // Use chain-specific query if available, otherwise use default
        const query = queries?.USER_BORROW_POSITIONS || USER_BORROW_POSITIONS

        const { data, error } = await client
          .query<UserBorrowPositionsQuery>(query, {
            where: { id_in: addresses },
          })
          .toPromise()

        if (error) {
          console.error(
            `Failed to fetch ${chainName} Compound V3 positions:`,
            error
          )
          // Check if it's a timeout error
          if (error.message?.includes('Time-out') || error.networkError) {
            console.warn(
              `${chainName} Compound V3 API timeout - returning empty positions`
            )
          }
          return [] // Return what we have so far
        }

        // Use custom transformer if provided, otherwise use default logic
        if (transformers?.getUserBorrowPositions && data) {
          return transformers.getUserBorrowPositions(
            data,
            COMPOUND_CONFIG.compound_v3.id
          )
        }

        // Default transformation logic (Messari schema)
        return (
          data?.accounts?.flatMap((account) => {
            return account.borrows
              .filter((borrow) => {
                // Only include supply positions (positive balance)
                const balance = BigInt(borrow.amount)
                return balance > 0n
              })
              .map((borrow): BorrowPosition => {
                // Convert balance from Wei to human-readable format
                const balanceInTokens = Number(
                  formatUnits(BigInt(borrow.amount ?? 0), borrow.asset.decimals)
                )

                // Calculate USD value: balance * price
                const balanceUsd =
                  balanceInTokens *
                  (parseFloat(borrow.asset.lastPriceUSD ?? '0') || 0)

                const mappingName =
                  CHAIN_NAME_MAPPING[borrow.market.protocol.network]

                const collaterals = account.deposits.map((deposit) => {
                  return {
                    address: deposit.asset.id,
                    name: deposit.asset.name,
                    symbol: deposit.asset.symbol,
                    decimals: deposit.asset.decimals,
                    amount: deposit.amount,
                    amountUSD:
                      Number(
                        formatUnits(
                          BigInt(deposit.amount ?? 0),
                          deposit.asset.decimals
                        )
                      ) * deposit.asset.lastPriceUSD,
                  }
                })

                return {
                  id: borrow.id,
                  protocol: COMPOUND_CONFIG.compound_v3.id,
                  healthFactor: 0, //Number(position.healthFactor),
                  userAddress: account.id.toLowerCase(),
                  poolId: borrow.market.id,
                  poolName: borrow.asset.symbol,
                  poolAddress: borrow.market.relation,
                  poolChainId: mappingName?.chainId,
                  network:
                    mappingName?.protocolName ?? borrow.market.protocol.network,
                  loanAssetAddress: borrow.market.inputToken.id,
                  loanAssetName: borrow.asset.name,
                  loanAssetSymbol: borrow.asset.symbol,
                  loanAssetDecimals: borrow.asset.decimals,
                  loanAssetAmount: balanceInTokens,
                  loanAssetAmountUsd: balanceUsd,
                  loanTimestamp: borrow.timestamp,
                  collaterals,
                  apy: parseFloat(
                    Number(borrow.market.rates?.[0].rate ?? '0').toFixed(2)
                  ),
                  link: mappingName
                    ? `https://app.compound.finance/?market=${borrow.asset.symbol.toLowerCase()}-${mappingName.marketSlug}`
                    : 'https://app.compound.finance',
                }
              })
          }) ?? []
        )
      })
    )

    // Aggregate results from all chains
    const allPositions = results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : []
    )

    return allPositions
  } catch (err) {
    console.error('Unexpected error fetching Compound V3 positions:', err)
    return []
  }
}

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
    const query = isDaily
      ? MARKET_DAILY_BORROW_RATES
      : MARKET_HOURLY_BORROW_RATES

    const { data, error } = await client
      .query<MarketDailyBorrowRatesQuery | MarketHourlyBorrowRatesQuery>(
        query,
        {
          where: { market: poolId, timestamp_gte: fromTimestamp },
        }
      )
      .toPromise()

    if (error) {
      console.error(
        `Failed to fetch ${chainName} Compound V3 ${isDaily ? 'daily' : 'hourly'} borrow rates:`,
        error
      )
      if (error.message?.includes('Time-out') || error.networkError) {
        console.warn(
          `${chainName} Compound V3 API timeout - returning empty rates`
        )
      }
      return []
    }

    const snapshots = isDaily
      ? (data as MarketDailyBorrowRatesQuery)?.marketDailySnapshots
      : (data as MarketHourlyBorrowRatesQuery)?.marketHourlySnapshots

    return (
      snapshots?.map((snapshot) => ({
        timestamp: Number(snapshot.timestamp),
        rate: Number(snapshot.rates?.[0].rate ?? '0'),
      })) ?? []
    )
  } catch (err) {
    console.error(
      'Unexpected error fetching Compound V3 market borrow rates:',
      err
    )
    return []
  }
}

async function getMarketLendHistoryRates({
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
    const query = isDaily ? MARKET_DAILY_LEND_RATES : MARKET_HOURLY_LEND_RATES

    const { data, error } = await client
      .query<MarketDailyLendRatesQuery | MarketHourlyLendRatesQuery>(query, {
        where: { market: poolId, timestamp_gte: fromTimestamp },
      })
      .toPromise()

    if (error) {
      console.error(
        `Failed to fetch ${chainName} Compound V3 ${isDaily ? 'daily' : 'hourly'} lend rates:`,
        error
      )
      if (error.message?.includes('Time-out') || error.networkError) {
        console.warn(
          `${chainName} Compound V3 API timeout - returning empty rates`
        )
      }
      return []
    }

    const snapshots = isDaily
      ? (data as MarketDailyLendRatesQuery)?.marketDailySnapshots
      : (data as MarketHourlyLendRatesQuery)?.marketHourlySnapshots

    return (
      snapshots?.map((snapshot) => ({
        timestamp: Number(snapshot.timestamp),
        rate: Number(snapshot.rates?.[0].rate ?? '0'),
      })) ?? []
    )
  } catch (err) {
    console.error(
      'Unexpected error fetching Compound V3 market lend rates:',
      err
    )
    return []
  }
}

export const compoundV3OnchainAdapter: DataAdapter = {
  dataSourceType: 'onchain',
  getUserLendPositions,
  getUserBorrowPositions,
  getMarketBorrowHistoryRates,
  getMarketLendHistoryRates,
  getLendingMarkets: async () => [],
}
