import { Address } from 'viem'

export type ProtocolName = 'aave' | 'compound' | 'morpho'
export type PositionType = 'supply' | 'borrow'
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
  protocolBreakdown: Record<ProtocolName, {
    supplyUSD: number
    borrowUSD: number
    positionCount: number
  }>
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
