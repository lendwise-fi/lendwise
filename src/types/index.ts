import { Address } from 'viem'

import type {
  ProtocolChain,
  ProtocolConfig,
  ProtocolName,
} from '@/config/protocols'
import {
  getProtocolAdapter,
  getProtocolConfig,
  getProtocolIds,
} from '@/config/protocols'

// ============================================================================
// PROTOCOL TYPES
// ============================================================================
// Re-export protocol-related types from config for convenience
// These are auto-generated from PROTOCOL_REGISTRY (single source of truth)
// ============================================================================
export type { ProtocolName, ProtocolConfig, ProtocolChain }
export { getProtocolAdapter, getProtocolConfig, getProtocolIds }

export type PositionType = 'lend' | 'borrow'
export type AssetType = 'stable' | 'volatile' | 'liquid-staking'

export interface Token {
  address: Address
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  type?: AssetType
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

export interface TokenPrice {
  address: Address
  priceUSD: number
  timestamp: number
}

export interface LendPosition {
  id: string
  protocol: ProtocolName
  userAddress: Address
  poolName: string
  poolAddress: Address
  poolChainNetwork: string
  assetName: string
  assetSymbol: string
  assetDecimals: number
  assetAmount: bigint
  assetAmountUsd: number
  apy: number
  link?: string
}

export interface BorrowPosition {
  id: string
  protocol: ProtocolName
  healthFactor: number
  userAddress: Address
  poolId: string
  poolName: string
  poolAddress: Address
  poolChainId: number
  poolChainNetwork: string
  loanAssetAddress: Address
  loanAssetName: string
  loanAssetSymbol: string
  loanAssetDecimals: number
  loanAssetAmount: number
  loanAssetAmountUsd: number
  loanTimestamp: number
  collaterals: (Token & { amount: number; amountUSD: number })[]
  apy: number
  link?: string
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

export interface MarketRate {
  timestamp: number
  rate: number
}

/**
 * Market rates interval constants
 * Use MARKET_RATES_INTERVAL.DAY or MARKET_RATES_INTERVAL.HOUR
 */
export const MARKET_RATES_INTERVAL = {
  HOUR: 'HOUR',
  DAY: 'DAY',
  WEEK: 'WEEK',
  MONTH: 'MONTH',
  QUARTER: 'QUARTER',
  YEAR: 'YEAR',
} as const

/**
 * Type derived from MARKET_RATES_INTERVAL values
 */
export type MarketRateInterval =
  (typeof MARKET_RATES_INTERVAL)[keyof typeof MARKET_RATES_INTERVAL]
