import type {
  PositionOnlyProtocol,
  ProtocolName,
} from '@/config/protocols-meta'

// ============================================================================
// PROTOCOL TYPES
// ============================================================================
// Re-export the adapter-id union so consumers can `import { ProtocolName } from '@/types'`.
// ============================================================================
export type { ProtocolName }

export type PositionType = 'supply' | 'borrow'
export type AssetType = 'stable' | 'volatile' | 'liquid-staking'

/** An address on any supported chain family: `0x…` on EVM, `G…` / `C…` on Stellar. */
export type ChainAddress = string
export type PositionProtocol = ProtocolName | PositionOnlyProtocol

export interface Token {
  address: ChainAddress
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  type?: AssetType
  /** Max LTV as a fraction (0–1). Borrow-collateral only; null when the
   *  protocol exposes no native max LTV (e.g. Morpho, which only has LLTV). */
  ltv?: number | null
  /** Liquidation LTV as a fraction (0–1). Borrow-collateral only. */
  lltv?: number | null
}

export interface Market {
  id: string
  protocol: ProtocolName
  asset: Token
  collateralAsset?: Token
  supplyAPY: number
  borrowAPY: number
  totalSupply: string
  totalBorrow: string
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
  user: ChainAddress
  market: Market
  type: PositionType
  amount: string
  amountUsd: number
  apy: number
  healthFactor?: number
  collateralEnabled: boolean
  timestamp: number
}

export interface UserPositionSummary {
  address: ChainAddress
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
  address: ChainAddress
  priceUSD: number
  timestamp: number
}

export interface SupplyPosition {
  id: string
  protocol: PositionProtocol
  network: string
  userAddress: ChainAddress
  poolName: string
  poolAddress: ChainAddress
  poolId: string
  poolChainId: number
  assetAddress: ChainAddress
  assetName: string
  assetSymbol: string
  assetDecimals: number | null
  assetAmount: string | null
  assetAmountUsd: number | null
  assetLiveAmountUsd: number | null
  apy: number | null
  link?: string
  riskAccountId?: string
  productId?: string
  logoURI?: string
}

export interface SupplyProduct {
  protocol: ProtocolName
  network: string
  poolName: string
  poolAddress: ChainAddress
  poolId: string
  poolChainId: number
  assetAddress: ChainAddress
  assetName: string
  assetSymbol: string
  assetDecimals: number
  assetAmount: string | null
  assetAmountUsd: number | null
  assetPriceUsd?: number
  liquidityAmount: string | null
  liquidityAmountUsd: number | null
  /**
   * The standardized net APY of the latest hourly row, or **undefined when we
   * have not measured one**.
   *
   * It used to fall back to the adapter's raw value without saying so, and the
   * two were indistinguishable on screen. That is what produced the 0.00 % on
   * an idle market on 2026-07-26: no hourly row, so the adapter's figure was
   * shown as if it had been measured — and it sorted like one. A display says
   * what it knows; the column renders "—".
   */
  apy?: number
  apyDaily?: number
  apyMonthly?: number
  apyYearly?: number
  /**
   * Reward component of the matching APY horizon, in the same unit (APY, not
   * points). Only used to tell "this rate includes incentives" apart from a pure
   * base rate — `undefined` means unknown, `0` means no rewards.
   */
  apyRewards?: number
  apyRewardsDaily?: number
  apyRewardsMonthly?: number
  apyRewardsYearly?: number
  productId?: string
  link?: string
  logoURI?: string
  utilizationRate?: number | null
  xoxno?: import('@/lib/protocols/xoxno/v1/types').XoxnoMeta
  xoxnoSelection?: import('@/lib/protocols/xoxno/v1/types').XoxnoSelection
}

export interface BorrowProduct {
  protocol: ProtocolName
  network: string
  poolName: string
  poolAddress: ChainAddress
  poolId: string
  poolChainId: number
  assetAddress: ChainAddress
  assetName: string
  assetSymbol: string
  assetDecimals: number
  assetAmount: string | null
  assetAmountUsd: number | null
  liquidityAmount: string | null
  liquidityAmountUsd: number | null
  collaterals: Token[]
  /**
   * The standardized net APY of the latest hourly row, or **undefined when we
   * have not measured one**.
   *
   * It used to fall back to the adapter's raw value without saying so, and the
   * two were indistinguishable on screen. That is what produced the 0.00 % on
   * an idle market on 2026-07-26: no hourly row, so the adapter's figure was
   * shown as if it had been measured — and it sorted like one. A display says
   * what it knows; the column renders "—".
   */
  apy?: number
  apyDaily?: number
  apyMonthly?: number
  apyYearly?: number
  /**
   * Reward component of the matching APY horizon, in the same unit (APY, not
   * points). Only used to tell "this rate includes incentives" apart from a pure
   * base rate — `undefined` means unknown, `0` means no rewards.
   *
   * A borrow rate is usually a pure cost, but not always: Blend emits BLND
   * to borrowers (see blend/common/utils.ts:computeEmissionsApr) and Aave's
   * Merit program does the same. Same contract as SupplyProduct.apyRewards.
   */
  apyRewards?: number
  apyRewardsDaily?: number
  apyRewardsMonthly?: number
  apyRewardsYearly?: number
  productId?: string
  link?: string
  logoURI?: string
  utilizationRate?: number | null
  xoxno?: import('@/lib/protocols/xoxno/v1/types').XoxnoMeta
  xoxnoSelection?: import('@/lib/protocols/xoxno/v1/types').XoxnoSelection
}

export interface BorrowPosition {
  id: string
  protocol: PositionProtocol
  network: string
  healthFactor: number
  userAddress: ChainAddress
  poolId: string
  poolName: string
  poolAddress: ChainAddress
  poolChainId: number
  loanAssetAddress: ChainAddress
  loanAssetName: string
  loanAssetSymbol: string
  loanAssetDecimals: number | null
  loanAssetAmount: number | null
  loanAssetAmountUsd: number | null
  loanLiveAssetAmountUsd: number | null
  loanTimestamp: number
  collaterals: (Omit<Token, 'address' | 'decimals'> & {
    address: ChainAddress
    decimals: number | null
    amount: number | null
    amountUsd: number | null
  })[]
  apy: number | null
  link?: string
  riskAccountId?: string
  productId?: string
  logoURI?: string
  loanAssetAmountRaw?: string | null
}

export interface UserPosition {
  supply: { [protocol: string]: SupplyPosition[] }
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

export type TimeframeLabel = '24h' | '7d' | '1M' | '3M' | '1Y' | 'Max'

export interface TimeframeOption {
  label: TimeframeLabel
  interval: MarketRateInterval
  days?: number
}

export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { label: '24h', interval: MARKET_RATES_INTERVAL.HOUR, days: 1 },
  { label: '7d', interval: MARKET_RATES_INTERVAL.DAY, days: 7 },
  { label: '1M', interval: MARKET_RATES_INTERVAL.DAY, days: 30 },
  { label: '3M', interval: MARKET_RATES_INTERVAL.DAY, days: 90 },
  { label: '1Y', interval: MARKET_RATES_INTERVAL.DAY, days: 365 },
  { label: 'Max', interval: MARKET_RATES_INTERVAL.DAY },
]

export interface StatCard {
  label: string
  value: string
  sub?: string
  /** Comparison against the rows currently filtered in the table. */
  note?: string
  /** Colours the note — reserved for the one card carrying an action. */
  noteAccent?: boolean
  accent?: boolean
  /** Makes the card a button — used to filter the table down to the market it names. */
  onClick?: () => void
}
