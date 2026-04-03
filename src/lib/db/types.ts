/**
 * @file types.ts
 * MongoDB document types for the APY standard.
 *
 * Collections:
 *   products   — static registry of all supply/borrow products
 *   apy.hourly — rolling average APY per hour (classic collection, upserted every 10 min)
 *   apy.daily  — daily average APY computed from apy.hourly (classic collection)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

export type Kind = 'supply' | 'borrow'
export type ProviderId = 'aave' | 'morpho' | 'compound'

export type ProductType = 'reserve' | 'market' | 'vault'

export type HourlyQualityStatus = 'building' | 'complete' | 'partial'
export type SlotQualityStatus = 'building' | 'complete' | 'partial'
export type DailyQualityStatus = 'complete' | 'partial' | 'missing'

export interface Chain {
  id: number // EVM chain ID — 1 = Ethereum, 8453 = Base, 42161 = Arbitrum
  name: string // "ethereum" | "base" | "arbitrum" | "polygon"
}

export interface Asset {
  symbol: string
  name: string
  address: string
  decimals: number
}

// ─────────────────────────────────────────────────────────────────────────────
// pools collection
// ─────────────────────────────────────────────────────────────────────────────

export interface Collateral {
  symbol: string
  name: string
  address: string
  decimals: number
  /**
   * Maximum LTV allowed to open a borrow position.
   * null for Morpho Blue — the protocol only exposes lltv.
   */
  ltv: number | null
  /** Liquidation threshold — position becomes liquidatable above this LTV. */
  lltv: number
  /**
   * Whether this asset can be used as collateral on this specific market.
   * Sourced from AAVE's supplyInfo.canBeCollateral.
   * Always true for Morpho Blue.
   */
  canBeCollateral: boolean
}

// ─── Protocol-specific meta — merged into protocol.meta ───────────────────────

/**
 * AAVE supply — a "reserve" in AAVE terminology.
 * Identified by the underlying asset address (underlyingToken).
 */
export interface ProtocolMetaAaveSupply {
  underlyingToken: string // underlying asset contract address
  aTokenSymbol: string // e.g. "aEthLidoUSDC"
  /** Maximum LTV allowed if this asset is used as collateral — e.g. 0.75 */
  maxLTV: number
  /** Liquidation threshold — position becomes liquidatable above this LTV — e.g. 0.80 */
  liquidationThreshold: number
}

/**
 * AAVE borrow — same "reserve", borrow side.
 * IRM parameters fixed by governance.
 */
export interface ProtocolMetaAaveBorrow {
  underlyingToken: string // underlying asset contract address
  vTokenSymbol: string // e.g. "variableDebtEthLidoUSDC"
  variableRateSlope1: number
  variableRateSlope2: number
  optimalUsageRate: number
  baseVariableBorrowRate: number
}

/**
 * Morpho Blue borrow — same market, borrow side.
 */
export interface ProtocolMetaMorphoBlueBorrow {
  id: string // marketId hash
  lltv: number // liquidation LTV for this market — e.g. 0.915
}

/**
 * MetaMorpho supply — a "vault" built on top of Morpho Blue markets.
 * Identified by the vault contract address.
 * No borrow side — vaults are supply-only.
 */
export interface ProtocolMetaMetaMorphoSupply {
  name: string
  symbol: string
  address: string // vault contract address
  curators: string[] // e.g. ["Steakhouse", "Gauntlet"]
}

/**
 * Compound supply — a "market" in Compound terminology.
 * Identified by the cToken (v2) or Comet (v3) contract address.
 */
export interface ProtocolMetaCompoundSupply {
  cToken: string // e.g. "cUSDCv3" contract address
  reserveFactor: number // e.g. 0.10
}

/**
 * Compound borrow — same market, borrow side.
 */
export interface ProtocolMetaCompoundBorrow {
  cToken: string
  reserveFactor: number
}

// ─── Product base ─────────────────────────────────────────────────────────────

export interface BaseProduct {
  /**
   * Deterministic slug — primary key.
   * Format: {protocol.provider}-{protocol.name}-{asset.symbol}-{kind}
   * Morpho Blue borrow: …-{collateral.symbol}-borrow
   */
  _id: string
  active: boolean
  createdAt: Date
  updatedAt: Date
  asset: Asset
  protocol: {
    /** Normalized provider identifier for filtering — "aave" | "morpho" | "compound" */
    provider: ProviderId
    type: ProductType
    version: string
    /**
     * Native market/deployment name, verbatim from the protocol subgraph.
     * Examples: "AaveV3Ethereum", "AaveV3EthereumLido", "MorphoBlueEthereum"
     */
    name: string
    subgraphUrl: string
    chain: Chain
    /** Protocol contract address — supplying pool / market factory. */
    address: string
    /**
     * Protocol-specific metadata — type discriminator + native identifier
     * + governance parameters.
     */
    meta:
      | ProtocolMetaAaveSupply
      | ProtocolMetaAaveBorrow
      | ProtocolMetaMorphoBlueBorrow
      | ProtocolMetaMetaMorphoSupply
      | ProtocolMetaCompoundSupply
      | ProtocolMetaCompoundBorrow
  }
}

export interface SupplyProduct extends BaseProduct {
  kind: 'supply'
  protocol: BaseProduct['protocol'] & {
    meta:
      | ProtocolMetaAaveSupply
      | ProtocolMetaMetaMorphoSupply
      | ProtocolMetaCompoundSupply
  }
}

export interface BorrowProduct extends BaseProduct {
  kind: 'borrow'
  /** Always non-empty on a borrow product. */
  collaterals: Collateral[]
  protocol: BaseProduct['protocol'] & {
    meta:
      | ProtocolMetaAaveBorrow
      | ProtocolMetaMorphoBlueBorrow
      | ProtocolMetaCompoundBorrow
  }
}

export type Product = SupplyProduct | BorrowProduct

// ─────────────────────────────────────────────────────────────────────────────
// Shared APY types — used by apy.hourly and apy.daily
// ─────────────────────────────────────────────────────────────────────────────

export interface RewardItem {
  token: {
    symbol: string
    address: string
  }
  /**
   * Raw APR as returned by the source protocol — stored for traceability.
   * Morpho:  state.rewards[].supplyApr / borrowApr
   * AAVE:    AaveSupplyIncentive.extraSupplyApr / AaveBorrowIncentive.borrowAprDiscount
   * Merkl:   opportunity.apr
   */
  apr: number
  /**
   * APR converted to APY using daily compounding (n=365).
   * APY = (1 + APR / 365)^365 - 1
   */
  apy: number
  source: 'protocol' | 'merkl' | 'merit'
  program: string | null
}

export interface ApyBreakdown {
  /** Average base APY from the protocol IRM — before fees, without rewards. */
  base: number
  /** Average sum of all reward APYs. */
  rewards: number
  /** Average protocol fee APY. */
  fees: number
  /**
   * Average net APY — effective rate for the user.
   * Supply:   base - fees + rewards
   * Borrow: base + fees - rewards
   */
  net: number
  /**
   * Reward items from the last slot — not averaged.
   * Items can appear/disappear between slots.
   */
  rewardItems: RewardItem[]
}

// ─── Market state — split by kind ─────────────────────────────────────────────

export interface SupplyMarketState {
  /** Average total amount supplied in native token units. */
  supplyAssets: number
  /** Average total value supplied in USD. */
  supplyAssetsUsd: number
  /** Average borrow utilization rate — 0 to 1. */
  utilizationRate: number
  /** Average loan asset price in USD. */
  assetPriceUsd: number
}

export interface BorrowMarketState {
  /** Average total amount supplied in native token units. */
  supplyAssets: number
  /** Average total value supplied in USD. */
  supplyAssetsUsd: number
  /** Average total amount borrowed in native token units. */
  borrowAssets: number
  /** Average total value borrowed in USD. */
  borrowAssetsUsd: number
  /** Average borrow utilization rate — 0 to 1. */
  utilizationRate: number
  /** Average loan asset price in USD. */
  assetPriceUsd: number
  /**
   * Average total collateral in USD.
   * null for AAVE/Compound (multi-collateral).
   */
  collateralAssetsUsd: number | null
  /**
   * Average collateral/loan price ratio.
   * Morpho Blue only — null for AAVE/Compound.
   */
  priceCollateralInLoanAsset: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// apy.hourly collection
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotQuality {
  /**
   * Number of 10-min slots that contributed to the rolling average.
   * Expected: 6 for a complete hour.
   */
  count: number
  /** Expected slots per hour — always 6. */
  expectedCount: 6
  /** Timestamp of the first slot that contributed to this hour. */
  firstSlot: Date
  /** Timestamp of the most recent slot that contributed. */
  lastSlot: Date
  /**
   * building — hour in progress, count < 6
   * complete — count >= 6
   * partial  — hour is past but count < 6 (gaps detected)
   */
  status: SlotQualityStatus
}

export interface SupplyApySlot {
  /**
   * Hour boundary UTC — normalized to the top of the hour.
   * 11:17:42Z → 11:00:00.000Z
   * Upsert key: (productId, hour).
   */
  hour: Date
  productId: string
  apy: ApyBreakdown
  market: SupplyMarketState
  quality: SlotQuality
}

export interface BorrowApySlot {
  /**
   * Hour boundary UTC — normalized to the top of the hour.
   * 11:17:42Z → 11:00:00.000Z
   * Upsert key: (productId, hour).
   */
  hour: Date
  productId: string
  apy: ApyBreakdown
  market: BorrowMarketState
  quality: SlotQuality
}

export type ApySlot = SupplyApySlot | BorrowApySlot

// ─────────────────────────────────────────────────────────────────────────────
// SpotPayload — fetcher output, input to the hourly upsert pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized snapshot returned by each protocol fetcher.
 * Contains only the data needed to compute the rolling average in apy.hourly.
 * No timestamp — assigned by the orchestrator at collection time.
 */
export type SpotPayload = {
  productId: string
  kind: Kind
  protocol: ProviderId
  chainId: number
  /** Loan asset symbol — "USDC", "WETH". */
  asset: string
  apy: {
    base: number
    rewards: number
    fees: number
    net: number
    rewardItems: RewardItem[]
  }
  market: SupplyMarketState | BorrowMarketState
}

// ─────────────────────────────────────────────────────────────────────────────
// apy.daily collection
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyQuality {
  /**
   * Number of hourly docs found in the [D-1 00:00Z, D 00:00Z[ window.
   * Expected: 24 for a complete day.
   */
  actualCount: number
  /** Expected hourly docs per day — always 24. */
  expectedCount: 24
  /**
   * actualCount / expectedCount — 0 to 1.
   * < 0.5  → treat as unreliable, exclude from optimization engine
   * < 1.0  → partial day, averages may be slightly biased
   * = 1.0  → complete day
   */
  completeness: number
  /**
   * complete — all 24 hourly docs present
   * partial  — some hours missing but above 0.5 threshold
   * missing  — below 0.5 threshold — document written but flagged unreliable
   */
  status: DailyQualityStatus
  /**
   * Incremented each time this daily document is recomputed.
   * > 1 indicates the document was replayed (manual backfill or gap recovery).
   */
  revision: number
  /** Timestamp when the aggregation job ran. */
  computedAt: Date
}

export interface SupplyApyDaily {
  /**
   * Midnight UTC of the day covered.
   * 2025-03-12 → 2025-03-12T00:00:00.000Z
   * Upsert key: (productId, date).
   */
  date: Date
  productId: string
  apy: ApyBreakdown
  market: SupplyMarketState
  quality: DailyQuality
}

export interface BorrowApyDaily {
  /**
   * Midnight UTC of the day covered.
   * 2025-03-12 → 2025-03-12T00:00:00.000Z
   * Upsert key: (productId, date).
   */
  date: Date
  productId: string
  apy: ApyBreakdown
  market: BorrowMarketState
  quality: DailyQuality
}

export type ApyDaily = SupplyApyDaily | BorrowApyDaily
