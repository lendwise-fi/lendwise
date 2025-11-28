import type { Address } from 'viem'

import type {
  BorrowPosition,
  LendPosition,
  MarketRate,
  MarketRateInterval,
  MarketStats,
} from '@/types'

import type { DataSourceConfig, ProtocolAdapter, VersionAdapter } from './types'

/**
 * Creates a protocol adapter with version management capabilities.
 * This factory function provides a unified interface for protocols with multiple versions.
 *
 * The protocol name is automatically derived from the version configs.
 * Each version can have its own protocol ID (e.g., 'morpho_v1', 'aave_v3').
 *
 * @param versionConfigs Map of version configs (e.g., MORPHO_CONFIG, AAVE_CONFIG)
 * @param versions Map of version identifiers to their adapters
 * @param defaultVersion The default version to use when none is specified
 * @returns A ProtocolAdapter instance
 *
 * @example
 * ```typescript
 * const aaveAdapter = createProtocolAdapter(
 *   AAVE_CONFIG,
 *   {
 *     aave_v2: aaveV2Adapter,
 *     aave_v3: aaveV3Adapter,
 *   },
 *   'aave_v3'
 * )
 *
 * // Use default version (aave_v3)
 * const positions = await aaveAdapter.getUserLendPositions(['0x...'])
 *
 * // Use specific version
 * const v2Positions = await aaveAdapter.getUserLendPositions(['0x...'], 'aave_v2')
 * ```
 */
export function createProtocolAdapter(
  versionConfigs: Record<string, { id: string; name: string }>,
  versions: Record<string, VersionAdapter>,
  defaultVersion: string
): ProtocolAdapter {
  // Validate that default version exists
  if (!versions[defaultVersion]) {
    throw new Error(`Default version '${defaultVersion}' not found in versions`)
  }

  // Validate that version config exists for default version
  const defaultVersionConfig = versionConfigs[defaultVersion]
  if (!defaultVersionConfig) {
    throw new Error(
      `Version config not found for default version '${defaultVersion}'`
    )
  }

  // Use the version config ID as the protocol identifier
  const protocol = defaultVersionConfig.id

  return {
    protocol,
    versions,
    defaultVersion,

    getVersion(version?: string): VersionAdapter {
      const targetVersion = version ?? this.defaultVersion
      const versionAdapter = this.versions[targetVersion]

      if (!versionAdapter) {
        const availableVersions = Object.keys(this.versions).join(', ')
        throw new Error(
          `Version '${targetVersion}' not supported for protocol '${this.protocol}'. Available versions: ${availableVersions}`
        )
      }

      return versionAdapter
    },

    async getUserLendPositions(
      params: { addresses: Address[] },
      version?: string
    ): Promise<LendPosition[]> {
      const versionAdapter = this.getVersion(version)
      const positionsAdapter = versionAdapter.dataSources.positions

      if (!positionsAdapter) {
        throw new Error(
          `No positions data source configured for ${this.protocol} ${versionAdapter.version}`
        )
      }

      if (!positionsAdapter.getUserLendPositions) {
        throw new Error(
          `Positions adapter for ${this.protocol} ${versionAdapter.version} does not implement getUserLendPositions`
        )
      }

      return positionsAdapter.getUserLendPositions(params)
    },

    async getUserBorrowPositions(
      params: { addresses: Address[] },
      version?: string
    ): Promise<BorrowPosition[]> {
      const versionAdapter = this.getVersion(version)
      const positionsAdapter = versionAdapter.dataSources.positions

      if (!positionsAdapter) {
        throw new Error(
          `No positions data source configured for ${this.protocol} ${versionAdapter.version}`
        )
      }

      if (!positionsAdapter.getUserBorrowPositions) {
        throw new Error(
          `Positions adapter for ${this.protocol} ${versionAdapter.version} does not implement getUserBorrowPositions`
        )
      }

      return positionsAdapter.getUserBorrowPositions(params)
    },

    async getMarketStats(version?: string): Promise<MarketStats[]> {
      const versionAdapter = this.getVersion(version)
      const statsAdapter = versionAdapter.dataSources.stats

      if (!statsAdapter) {
        console.warn(
          `No stats data source configured for ${this.protocol} ${versionAdapter.version}`
        )
        return []
      }

      if (!statsAdapter.getMarketStats) {
        console.warn(
          `Stats adapter for ${this.protocol} ${versionAdapter.version} does not implement getMarketStats`
        )
        return []
      }

      return statsAdapter.getMarketStats()
    },

    async getMarketBorrowRates(
      params: {
        chainId: number
        poolId: string
        interval: MarketRateInterval
        fromTimestamp: number
      },
      version?: string
    ): Promise<MarketRate[]> {
      const versionAdapter = this.getVersion(version)
      const ratesAdapter = versionAdapter.dataSources.rates

      if (!ratesAdapter) {
        console.warn(
          `No rates data source configured for ${this.protocol} ${versionAdapter.version}`
        )
        return []
      }

      if (!ratesAdapter.getMarketBorrowRates) {
        console.warn(
          `Rates adapter for ${this.protocol} ${versionAdapter.version} does not implement getMarketBorrowRates`
        )
        return []
      }

      return ratesAdapter.getMarketBorrowRates(params)
    },

    async getMarketLendRates(
      params: {
        chainId: number
        poolId: string
        interval: MarketRateInterval
        fromTimestamp: number
      },
      version?: string
    ): Promise<MarketRate[]> {
      const versionAdapter = this.getVersion(version)
      const ratesAdapter = versionAdapter.dataSources.rates

      if (!ratesAdapter) {
        console.warn(
          `No rates data source configured for ${this.protocol} ${versionAdapter.version}`
        )
        return []
      }

      if (!ratesAdapter.getMarketLendRates) {
        console.warn(
          `Rates adapter for ${this.protocol} ${versionAdapter.version} does not implement getMarketLendRates`
        )
        return []
      }

      return ratesAdapter.getMarketLendRates(params)
    },
  }
}

/**
 * Creates a version adapter with multiple data sources.
 *
 * @param version The version identifier (e.g., 'v2', 'v3')
 * @param dataSources Configuration of data sources for different operations
 * @returns A VersionAdapter instance
 *
 * @example
 * ```typescript
 * const aaveV3Adapter = createVersionAdapter('v3', {
 *   positions: aaveV3GraphqlAdapter,  // GraphQL for real-time positions
 *   stats: aaveV3SubgraphAdapter,     // Subgraph for historical stats
 * })
 * ```
 */
export function createVersionAdapter(
  version: string,
  dataSources: DataSourceConfig
): VersionAdapter {
  return {
    version,
    dataSources,
  }
}
