/**
 * Shared types for the APY data layer (MongoDB).
 */

export interface ApyTimeSeriesDocument {
  timestamp: Date
  metadata: {
    protocol: string
    market: {
      name: string
      address: string
      chain: {
        name: string
        id: number
      }
      vault: {
        symbol: string
        name: string
        address: string
      }
    }
  }
  supplyApy: number
  borrowApy: number
  supplyAssets: number
  supplyAssetsUsd: number
  borrowAssets: number
  borrowAssetsUsd: number
  collateralAssets: number
  collateralAssetsUsd: number
}
