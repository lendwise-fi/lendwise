import { Address } from 'viem'

export type ProtocolName = 'aave' | 'compound' | 'morpho'
export type PositionType = 'lend' | 'borrow'
export type AssetType = 'stable' | 'volatile' | 'liquid-staking'

export interface Token {
  address: Address
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  type: AssetType
}

export interface Market {
  id: string
  protocol: ProtocolName
  asset: Token
  collateralAsset?: Token
  supplyAPY: number
  borrowAPY: number
  totalSupply: bigint
  totalBorrow: bigint
  utilizationRate: number
  ltv: number
  liquidationThreshold: number
  liquidationBonus: number
  isActive: boolean
  isFrozen: boolean
}

export interface Position {
  id: string
  protocol: ProtocolName
  user: Address
  market: Market
  type: PositionType
  amount: bigint
  amountUSD: number
  apy: number
  healthFactor?: number
  collateralEnabled: boolean
  timestamp: number
}

export interface UserPositionSummary {
  address: Address
  totalSupplyUSD: number
  totalBorrowUSD: number
  netAPY: number
  healthFactor: number
  positions: Position[]
  protocolBreakdown: Record<
    ProtocolName,
    {
      supplyUSD: number
      borrowUSD: number
      positionCount: number
    }
  >
}

export interface ProtocolConfig {
  name: ProtocolName
  displayName: string
  chainId: number
  contracts: {
    pool?: Address
    dataProvider?: Address
    oracle?: Address
    comptroller?: Address
    morpho?: Address
  }
  subgraphUrl?: string
  blockExplorer: string
}

export interface TokenPrice {
  address: Address
  priceUSD: number
  timestamp: number
}

export interface LendPosition {
  id: string
  protocol: ProtocolName
  userId: string
  userAddress: Address
  poolId: string
  poolName: string
  poolAddress: Address
  poolSymbol: string
  poolChainId: number
  poolChainCurrency: string
  poolChainNetwork: string
  assetName: string
  assetSymbol: string
  assetDecimals: number
  assetAmount: bigint
  assetAmountUsd: number
  netApy: number
}

export interface BorrowPosition {
  id: string
  protocol: ProtocolName
  healthFactor: number
  userId: string
  userAddress: Address
  poolId: string
  poolName: string
  poolSymbol: string
  poolChainId: number
  poolChainCurrency: string
  poolChainNetwork: string
  loanAssetName: string
  loanAssetSymbol: string
  loanAssetDecimals: number
  loanAssetAmount: bigint
  loanAssetAmountUsd: number
  collateralAssetName?: string
  collateralAssetSymbol?: string
  collateralAssetDecimals?: number
  collateralAssetAmount: bigint
  collateralAssetAmountUsd: number
  netApy: number
}

export interface UserPosition {
  lend: { [protocol: string]: LendPosition[] }
  borrow: { [protocol: string]: BorrowPosition[] }
}

export interface MarketStats {
  protocol: ProtocolName
  assetSymbol: string
  tvl: number
  supplyApy: number
  borrowApy: number
  volume24h?: number
}
