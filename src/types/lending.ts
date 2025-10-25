export type Protocol = 'aave' | 'compound' | 'morpho'

export interface LendingPosition {
  protocol: Protocol
  assetSymbol: string
  assetAddress: `0x${string}`
  supplied: bigint
  borrowed: bigint
  apySupply: number
  apyBorrow: number
  collateralFactor?: number
}

export interface MarketStats {
  protocol: Protocol
  assetSymbol: string
  tvl: number
  supplyApy: number
  borrowApy: number
  volume24h?: number
}
