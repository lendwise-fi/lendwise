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

/** Asset descriptor with optional USD price (used in vault and market standards). */
export interface LoanAsset {
  symbol: string
  name: string
  address: string
  price_in_dollars: number
}

/** APY breakdown: native rate, rewards, fees, net (standardized across protocols). */
export interface SupplyBorrowApyStandard {
  native: number
  rewards: number
  fees: number
  net: number
  rateData?: ProtocolData
}

/**
 * Vault timeseries document (lender side only).
 * "Vault" = place where lenders lend their crypto (Morpho terminology).
 */
export interface VaultApyTimeSeriesDocument {
  kind: 'vault'
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
      loan_asset: LoanAsset
      vaultData?: ProtocolData
    }
  }
  supplyApy: SupplyBorrowApyStandard
  supplyAssets: number
  supplyAssetsUsd: number
}

/**
 * Market timeseries document (lenders + borrowers).
 * "Market" = place where borrowers borrow crypto (Morpho terminology).
 */
export interface MarketApyTimeSeriesDocument {
  kind: 'market'
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
    market: {
      loan_asset: LoanAsset
      collateral_asset?: LoanAsset
      marketData?: ProtocolData
    }
  }
  supplyApy: SupplyBorrowApyStandard
  borrowApy: SupplyBorrowApyStandard
  supplyAssets: number
  supplyAssetsUsd: number
  borrowAssets: number
  borrowAssetsUsd: number
  collateralAssets?: number
  collateralAssetsUsd?: number
  price_collateral_in_loan_asset?: number
}

/**
 * Union of all APY documents stored in the single "apy" collection.
 * Use the top-level kind field to filter vaults vs markets in queries.
 */
export type ApyDocument =
  | VaultApyTimeSeriesDocument
  | MarketApyTimeSeriesDocument

/**
 * Legacy unified document shape returned by protocol fetchers.
 * Converted into Vault + Market docs before writing to MongoDB.
 */
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
