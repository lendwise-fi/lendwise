/**
 * Shared types for the APY data layer (MongoDB).
 */

export interface ProtocolDataAave {
  variableRateSlope1?: number
  variableRateSlope2?: number
  optimalUsageRate?: number
  baseVariableBorrowRate?: number
}

export interface ProtocolDataMorpho {
  netApy?: number
  avgApy?: number
}

export interface ProtocolDataCompound {
  // Add Compound-specific extras here as needed
  reserveFactor?: number
}

export type ProtocolData =
  | ProtocolDataAave
  | ProtocolDataMorpho
  | ProtocolDataCompound

export interface ApyTimeSeriesDocument {
  timestamp: Date
  metadata: {
    chain: {
      id: number
      name: string
    }
    protocol: {
      name: string
      address: string
    }
    vault: {
      symbol: string
      name: string
      address: string
    }
  }
  supplyApy: {
    native: number
    rewards: number
    fees: number
    total: number
    protocolData?: ProtocolData
  }
  borrowApy: {
    native: number
    rewards: number
    fees: number
    total: number
    protocolData?: ProtocolData
  }
  supplyAssets: number
  supplyAssetsUsd: number
  borrowAssets: number
  borrowAssetsUsd: number
  collateralAssets: number
  collateralAssetsUsd: number
}
