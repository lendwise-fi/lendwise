import { Client, cacheExchange, createClient, fetchExchange } from '@urql/core'
import type { Address } from 'viem'
import { formatUnits } from 'viem'

import type { BaseDataAdapter } from '@/lib/adapters/types'
import { BorrowPosition, LendPosition } from '@/types'

import { COMPOUND_CONFIG } from '../../config'
import type {
  UserBorrowPositionsQuery,
  UserLendPositionsQuery,
} from './generated/graphql'
import { USER_BORROW_POSITIONS, USER_LEND_POSITIONS } from './queries'

/**
 * Creates a GraphQL client for a specific chain.
 *
 * @param subgraphUrl - The subgraph URL from the chain config
 * @param apiKey - Optional API key for authenticated requests
 * @returns Configured urql Client
 */
export function createChainClient(
  subgraphUrl: string,
  apiKey?: string
): Client {
  return createClient({
    url: subgraphUrl,
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      signal: AbortSignal.timeout(20000), // 20 second timeout
    },
    preferGetMethod: false,
    requestPolicy: 'network-only',
  })
}

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
 *
 * Note: Uses `unknown` for data parameter since different chains may have different
 * GraphQL schemas. Each chain's transformer should type-cast to their specific schema.
 */
export type ChainTransformers = {
  /**
   * Transform raw query data into LendPosition array.
   * If not provided, uses default transformation logic.
   * @param data - The GraphQL query result data (schema-specific, should be type-cast)
   * @param protocolId - The protocol identifier
   */
  getUserLendPositions?: (data: unknown, protocolId: string) => LendPosition[]

  /**
   * Transform raw query data into BorrowPosition array.
   * If not provided, uses default transformation logic.
   * @param data - The GraphQL query result data (schema-specific, should be type-cast)
   * @param protocolId - The protocol identifier
   */
  getUserBorrowPositions?: (
    data: unknown,
    protocolId: string
  ) => BorrowPosition[]
}

/**
 * Chain client configuration type.
 */
export type ChainClient = {
  client: Client
  chainId: number
  chainName?: string
  queries?: ChainQueries
  transformers?: ChainTransformers
}

/**
 * Registry for chain clients.
 * Uses lazy initialization to avoid circular dependency issues.
 */
const chainRegistry: ChainClient[] = []
let initialized = false

/**
 * Register a chain client to be used for data fetching.
 * Called by each chain folder (ethereum, base, polygon, etc.)
 *
 * @param config - Chain client configuration
 */
export function registerChain(config: ChainClient): void {
  chainRegistry.push(config)
}

/**
 * Initialize all chain clients automatically based on protocol config.
 * This is called lazily on first use to avoid circular dependency issues.
 *
 * Chains are automatically registered by reading the COMPOUND_CONFIG and
 * dynamically importing chain modules that have a clientPath defined.
 */
async function initializeChains(): Promise<void> {
  if (initialized) return
  initialized = true

  // Get all chains from config that have a clientPath defined
  const chainsToRegister = Object.entries(COMPOUND_CONFIG.compound_v3.chains)
    .filter(([_, chainConfig]) => chainConfig.custom?.clientPath)
    .map(([_, chainConfig]) => ({
      path: chainConfig.custom.clientPath!,
      chainId: chainConfig.id,
      chainName: chainConfig.name,
    }))

  // Dynamically import all chain modules - they will call registerChain()
  await Promise.all(
    chainsToRegister.map(async ({ path, chainId, chainName }) => {
      try {
        await import(`./${path}`)
      } catch (error) {
        console.error(
          `Failed to initialize chain client for ${chainName} (${chainId}):`,
          error
        )
      }
    })
  )
}

/**
 * Get all registered chain clients.
 */
async function getChainClients(): Promise<ChainClient[]> {
  await initializeChains()
  return chainRegistry
}

/**
 * Maps Compound subgraph Network enum values to human-readable chain names.
 * Add entries as new chains are supported.
 */
const CHAIN_NAME_MAPPING: Record<
  string,
  { protocolName: string; marketSlug: string }
> = {
  MAINNET: { protocolName: 'Ethereum', marketSlug: 'mainnet' },
  ARBITRUM_ONE: { protocolName: 'Arbitrum', marketSlug: 'arb' },
}

async function getUserLendPositions(
  addresses: Address[]
): Promise<LendPosition[]> {
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
                  poolChainNetwork:
                    CHAIN_NAME_MAPPING[position.market.protocol.network]
                      ?.protocolName ?? position.market.protocol.network,
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

async function getUserBorrowPositions(
  addresses: Address[]
): Promise<BorrowPosition[]> {
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
                  poolName: borrow.asset.symbol,
                  poolAddress: borrow.market.relation,
                  poolChainNetwork:
                    mappingName?.protocolName ?? borrow.market.protocol.network,
                  loanAssetName: borrow.asset.name,
                  loanAssetSymbol: borrow.asset.symbol,
                  loanAssetDecimals: borrow.asset.decimals,
                  loanAssetAmount: balanceInTokens,
                  loanAssetAmountUsd: balanceUsd,
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

export const compoundV3OnchainAdapter: BaseDataAdapter = {
  dataSourceType: 'onchain',
  getUserLendPositions,
  getUserBorrowPositions,
}
