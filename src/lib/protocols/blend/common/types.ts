export interface BlendSupplyMeta {
  /** Pool contract (UPPERCASE strkey) — where the reserve's state lives. */
  poolId: string
  /** Reserve asset contract. */
  assetId: string
  /** Deployment label — 'v1' | 'v2' | 'v2.1' (see ./deployments). */
  version: string
  wasmHash: string
  admin: string
  name: string
  backstop: string
  backstopRate: number
  maxPositions: number
  /** Stroops-scale integer, kept as a string: jsonb goes through JSON.stringify, which throws on a BigInt. */
  minCollateral: string
  oracle: string
  status: number
  reserveList: string[]
  latestLedger: number
}

export interface BlendBorrowMeta {
  /** Pool contract (UPPERCASE strkey) — where the reserve's state lives. */
  poolId: string
  /** Reserve asset contract. */
  assetId: string
  /** Deployment label — 'v1' | 'v2' | 'v2.1' (see ./deployments). */
  version: string
  wasmHash: string
  admin: string
  name: string
  backstop: string
  backstopRate: number
  maxPositions: number
  /** Stroops-scale integer, kept as a string: jsonb goes through JSON.stringify, which throws on a BigInt. */
  minCollateral: string
  oracle: string
  status: number
  reserveList: string[]
  latestLedger: number
}

export type TokenMetadata = {
  address: string
  symbol: string
  name: string
  decimals: number
}
