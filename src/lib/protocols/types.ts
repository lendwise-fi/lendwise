import type { Address } from 'viem'

import {
  BorrowPosition,
  MarketRate,
  MarketStats,
  SupplyMarket,
  SupplyPosition,
  TimeframeLabel,
} from '@/types'

// ============================================================================
// DATA SOURCE TYPES
// ============================================================================

/**
 * Identifies the type of data source used by an adapter.
 */
export type DataSourceType = 'offchain' | 'onchain'

// ============================================================================
// UNIFIED DATA ADAPTER INTERFACE
// ============================================================================

/**
 * Unified interface for all data adapters (GraphQL or Subgraph).
 * Each implementation chooses which methods to support based on its data source capabilities.
 *
 * - GraphQL adapters typically implement position methods for real-time data
 * - Subgraph adapters typically implement stats/rates methods for historical/aggregated data
 * - Some adapters may implement all methods if the data source supports it
 */
export interface DataAdapter {
  /**
   * The type of data source this adapter uses.
   */
  readonly dataSourceType: DataSourceType

  /**
   * Fetches the user's supplying positions.
   * @param params Parameters for fetching supplying positions.
   * @param params.addresses Array of user addresses to fetch positions for.
   * @returns A promise that resolves to an array of supplying positions.
   */
  getUserSupplyPositions?(params: {
    addresses: Address[]
  }): Promise<SupplyPosition[]>

  /**
   * Fetches the user's borrowing positions.
   * @param params Parameters for fetching borrowing positions.
   * @param params.addresses Array of user addresses to fetch positions for.
   * @returns A promise that resolves to an array of borrowing positions.
   */
  getUserBorrowPositions?(params: {
    addresses: Address[]
  }): Promise<BorrowPosition[]>

  /**
   * Fetches market statistics (TVL, volume, APY, etc.).
   * Typically provided by Subgraph for historical/aggregated data.
   * @returns A promise that resolves to an array of market statistics.
   */
  getMarketStats?(): Promise<MarketStats[]>

  /**
   * Fetches market rates (supply rates, borrow rates, etc.).
   * Can be provided by either GraphQL or Subgraph depending on availability.
   * @param params Parameters for fetching market rates.
   * @param params.poolId The pool/market identifier.
   * @param params.timeline The timeline granularity (HOUR or DAY).
   * @param params.fromTimestamp The starting timestamp for historical data.
   * @returns A promise that resolves to an array of market rates.
   */
  getMarketBorrowHistoryRates?(params: {
    poolId: string
    interval: TimeframeLabel
    fromTimestamp: number
    chainId: number
    tokenId: Address
  }): Promise<MarketRate[]>

  /**
   * Fetches market rates (supply rates, borrow rates, etc.).
   * Can be provided by either GraphQL or Subgraph depending on availability.
   * @param params Parameters for fetching market rates.
   * @param params.poolId The pool/market identifier.
   * @param params.timeline The timeline granularity (HOUR or DAY).
   * @param params.fromTimestamp The starting timestamp for historical data.
   * @returns A promise that resolves to an array of market rates.
   */
  getMarketSupplyHistoryRates?(params: {
    poolId: string
    interval: TimeframeLabel
    fromTimestamp: number
    chainId: number
    tokenId: Address
  }): Promise<MarketRate[]>

  /**
   * Fetches market rates (supply rates, borrow rates, etc.).
   * Can be provided by either GraphQL or Subgraph depending on availability.
   * @returns A promise that resolves to an array of market rates.
   */
  getSupplyingMarkets?(): Promise<SupplyMarket[]>
}

// ============================================================================
// VERSION-SPECIFIC ADAPTER
// ============================================================================

/**
 * Data source configuration for a specific protocol version.
 * Allows using different adapters (GraphQL/Subgraph) for different data types.
 *
 * Each adapter exposes only the methods supported by its underlying data source:
 * - positions: Typically a GraphQL adapter with getUserSupplyPositions/getUserBorrowPositions
 * - stats: Typically a Subgraph adapter with getMarketStats
 * - rates: Either GraphQL or Subgraph adapter with getMarketBorrowHistoryRates/getMarketSupplyHistoryRates
 *
 * @example
 * ```typescript
 * const dataSources: DataSourceConfig = {
 *   positions: aaveV3GraphQLAdapter,  // Implements position methods
 *   stats: aaveV3SubgraphAdapter,     // Implements stats methods
 * }
 * ```
 */
export interface DataSourceConfig {
  /**
   * Adapter for real-time user position data.
   * Should implement getUserSupplyPositions and/or getUserBorrowPositions.
   */
  positions?: DataAdapter

  /**
   * Adapter for statistical and historical market data.
   * Should implement getMarketStats.
   */
  stats?: DataAdapter

  /**
   * Adapter for historical rate data.
   * Should implement getMarketBorrowHistoryRates/getMarketSupply Rates.
   */
  rates?: DataAdapter
}

/**
 * Represents a specific version of a protocol adapter.
 * Contains multiple data sources for different types of operations.
 */
export interface VersionAdapter {
  /**
   * The version identifier (e.g., 'v2', 'v3').
   */
  readonly version: string

  /**
   * Data sources configuration.
   * Different data sources can be used for different operations.
   */
  readonly dataSources: DataSourceConfig
}

// ============================================================================
// PROTOCOL ADAPTER
// ============================================================================

/**
 * Main protocol adapter that manages multiple versions.
 * Provides a unified interface for accessing different protocol versions.
 */
// Helper type to derive ProtocolAdapter methods from DataAdapter
// This maps every function in DataAdapter to a new function with an extra optional 'version' argument.
type ProtocolMethods = {
  [K in keyof Omit<DataAdapter, 'dataSourceType'>]-?: DataAdapter[K] extends
    | ((...args: infer A) => infer R)
    | undefined
    ? (...args: [...A, version?: string]) => R
    : never
}

/**
 * Main protocol adapter that manages multiple versions.
 * Provides a unified interface for accessing different protocol versions.
 */
export interface ProtocolAdapter extends ProtocolMethods {
  /**
   * The unique name of the protocol (e.g., 'aave', 'morpho', 'compound').
   */
  readonly protocol: string

  /**
   * Map of version identifiers to their respective adapters.
   * Example: { 'v2': VersionAdapter, 'v3': VersionAdapter }
   */
  readonly versions: Record<string, VersionAdapter>

  /**
   * The default version to use when no version is specified.
   */
  readonly defaultVersion: string

  /**
   * Get a specific version adapter.
   * @param version The version identifier. If not provided, returns the default version.
   * @returns The version adapter for the specified version.
   * @throws Error if the version is not supported.
   */
  getVersion(version?: string): VersionAdapter
}
