/**
 * Shared types for the APY data layer (MongoDB).
 * All APY documents live in the same collection per timeframe (e.g. spot);
 * the `kind` field discriminates lend vs borrow.
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
  reserveFactor?: number
}

export type ProtocolData =
  | ProtocolDataAave
  | ProtocolDataMorpho
  | ProtocolDataCompound

/** Asset descriptor with USD price (vault and market). */
export interface LoanAsset {
  symbol: string
  name: string
  address: string
  price_in_dollars: number
}

/** APY breakdown: native, rewards, fees, net; optional rateData (protocol-specific). */
export interface ApyRateData {
  native: number
  rewards: number
  fees: number
  net: number
  rateData?: ProtocolData
}

/**
 * Canonical shape for lend APY documents (kind = 'lend').
 * Stored in the same collection as borrow docs (e.g. spot); no borrowApy.
 */
export interface LendApyTimeSeriesDocument {
  kind: 'lend'
  timestamp: Date
  metadata: {
    chain: { id: number; name: string }
    protocol: { name: string; address: string }
    vault: {
      loan_asset: LoanAsset
      vaultData?: ProtocolData
    }
  }
  supplyApy: ApyRateData
  supplyAssets: number
  supplyAssetsUsd: number
}

/**
 * Canonical shape for borrow APY documents (kind = 'borrow').
 * Stored in the same collection as lend docs (e.g. spot); includes borrowApy and optional collateral.
 */
export interface BorrowApyTimeSeriesDocument {
  kind: 'borrow'
  timestamp: Date
  metadata: {
    chain: { id: number; name: string }
    protocol: { name: string; address: string }
    market: {
      loan_asset: LoanAsset
      collateral_asset?: LoanAsset
      marketData?: ProtocolData
    }
  }
  supplyApy: ApyRateData
  borrowApy: ApyRateData
  supplyAssets: number
  supplyAssetsUsd: number
  borrowAssets: number
  borrowAssetsUsd: number
  collateralAssets?: number
  collateralAssetsUsd?: number
  price_collateral_in_loan_asset?: number
}

/**
 * Union of all APY documents (lend or borrow) stored per timeframe collection.
 * Use the top-level kind field ('lend' | 'borrow') to filter in queries.
 */
export type ApyDocument =
  | LendApyTimeSeriesDocument
  | BorrowApyTimeSeriesDocument

/**
 * Legacy unified document shape returned by protocol fetchers.
 * Converted into Lend + Borrow docs before writing to MongoDB.
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
