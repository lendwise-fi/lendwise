import type { Address } from 'viem'

import { BorrowPosition, LendPosition, MarketStats } from '@/types'

// ============================================================================
// DATA SOURCE TYPES
// ============================================================================

/**
 * Identifies the type of data source used by an adapter.
 */
export type DataSourceType = 'offchain' | 'onchain'

// ============================================================================
// BASE ADAPTER INTERFACES
// ============================================================================

/**
 * Base interface for all data adapters (GraphQL or Subgraph).
 * Provides core methods for fetching user positions.
 */
export interface BaseDataAdapter {
  /**
   * The type of data source this adapter uses.
   */
  readonly dataSourceType: DataSourceType

  /**
   * Fetches the user's lending positions.
   * @param addresses Array of user addresses to fetch positions for.
   * @returns A promise that resolves to an array of lending positions.
   */
  getUserLendPositions(addresses: Address[]): Promise<LendPosition[]>

  /**
   * Fetches the user's borrowing positions.
   * @param addresses Array of user addresses to fetch positions for.
   * @returns A promise that resolves to an array of borrowing positions.
   */
  getUserBorrowPositions(addresses: Address[]): Promise<BorrowPosition[]>
}

/**
 * Adapter for fetching statistical or historical market data.
 */
export interface StatsAdapter {
  getMarketStats(): Promise<MarketStats[]>
  // other stats methods can go here
}

// ============================================================================
// VERSION-SPECIFIC ADAPTER
// ============================================================================

/**
 * Data source configuration for a specific data type.
 * Allows using different sources (GraphQL/Subgraph) for different operations.
 */
export interface DataSourceConfig {
  /**
   * Adapter for real-time user position data.
   * Typically uses GraphQL API for fast, real-time queries.
   */
  positions?: BaseDataAdapter

  /**
   * Adapter for statistical and historical market data.
   * Typically uses Subgraph for aggregated historical data.
   */
  stats?: StatsAdapter

  /**
   * Adapter for historical rate data.
   * Can use either GraphQL or Subgraph depending on availability.
   */
  rates?: BaseDataAdapter
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
export interface ProtocolAdapter {
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

  /**
   * Convenience method to fetch lending positions from a specific version.
   * Uses the 'positions' data source (typically GraphQL API).
   * @param addresses Array of user addresses.
   * @param version Optional version identifier. Uses default if not provided.
   */
  getUserLendPositions(
    addresses: Address[],
    version?: string
  ): Promise<LendPosition[]>

  /**
   * Convenience method to fetch borrowing positions from a specific version.
   * Uses the 'positions' data source (typically GraphQL API).
   * @param addresses Array of user addresses.
   * @param version Optional version identifier. Uses default if not provided.
   */
  getUserBorrowPositions(
    addresses: Address[],
    version?: string
  ): Promise<BorrowPosition[]>

  /**
   * Get market statistics from a specific version.
   * Uses the 'stats' data source (typically Subgraph).
   * @param version Optional version identifier. Uses default if not provided.
   */
  getMarketStats(version?: string): Promise<MarketStats[]>
}
