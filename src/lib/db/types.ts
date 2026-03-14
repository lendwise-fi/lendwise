/**
 * @file types.ts
 * MongoDB document types for the APY standard.
 *
 * Collections:
 *   pools      — static registry of all lend/borrow pools
 *   apy.hourly — rolling average APY per hour (classic collection, upserted every 10 min)
 *   apy.daily  — daily average APY computed from apy.hourly (classic collection)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

export type ProtocolName = 'aave' | 'morpho' | 'compound'

export type NativeType = 'reserve' | 'market' | 'vault' | 'comet'

export type Kind = 'lend' | 'borrow'

export type SlotQualityStatus  = 'building' | 'complete' | 'partial'
export type DailyQualityStatus = 'complete' | 'partial'  | 'missing'

export interface Chain {
  id:   number   // EVM chain ID — 1 = Ethereum, 8453 = Base, 42161 = Arbitrum
  name: string   // "ethereum" | "base" | "arbitrum" | "polygon"
}

export interface Asset {
  symbol:   string
  name:     string
  address:  string
  decimals: number
}

// ─────────────────────────────────────────────────────────────────────────────
// pools collection
// ─────────────────────────────────────────────────────────────────────────────

export interface Collateral {
  symbol:   string
  name:     string
  address:  string
  decimals: number
  /**
   * Maximum LTV allowed to open a borrow position.
   * null for Morpho Blue — the protocol only exposes lltv.
   */
  ltv:             number | null
  /** Liquidation threshold — position becomes liquidatable above this LTV. */
  lltv:            number
  /**
   * Whether this asset can be used as collateral on this specific market.
   * Sourced from AAVE's supplyInfo.canBeCollateral.
   * Always true for Morpho Blue.
   */
  canBeCollateral: boolean
}

// ─── Protocol meta ────────────────────────────────────────────────────────────

/** AAVE lend — supply-side parameters, fixed at reserve creation. */
export interface ProtocolMetaAaveLend {
  aTokenSymbol:         string   // e.g. "aEthLidoUSDC"
  /** Maximum LTV allowed if this asset is used as collateral — e.g. 0.75 */
  maxLTV:               number
  /** Liquidation threshold — position becomes liquidatable above this LTV — e.g. 0.80 */
  liquidationThreshold: number
}

/** AAVE borrow — IRM parameters fixed by governance. */
export interface ProtocolMetaAaveBorrow {
  variableRateSlope1:     number
  variableRateSlope2:     number
  optimalUsageRate:       number
  baseVariableBorrowRate: number
  vTokenSymbol:           string   // e.g. "variableDebtEthLidoUSDC"
}

/** Morpho Blue borrow — no static protocol meta needed for V1. */
export type ProtocolMetaMorphoBlue = Record<string, never>

/** MetaMorpho lend — no static protocol meta needed for V1. */
export type ProtocolMetaMorphoLend = Record<string, never>

/** MetaMorpho lend — vault configuration. */
export interface ProtocolMetaMetaMorpho {
  curator:           string     // e.g. "Steakhouse", "Gauntlet"
  underlyingMarkets: string[]   // list of Morpho Blue marketIds
}

/** Compound — market parameters fixed by governance. */
export interface ProtocolMetaCompound {
  reserveFactor: number   // e.g. 0.10
  cTokenSymbol:  string   // e.g. "cUSDCv3"
}

// ─── Pool base ────────────────────────────────────────────────────────────────

interface BasePool {
  /**
   * Deterministic slug — primary key.
   * Format: {protocol.name}-{protocol.market}-{asset.symbol}-{kind}
   * Morpho Blue borrow: …-{collateral.symbol}-borrow
   */
  _id: string

  protocol: {
    /** Normalized identifier for filtering — "aave" | "morpho" | "compound" */
    name:    ProtocolName
    /**
     * Native market name, verbatim from the protocol subgraph.
     * Examples: "AaveV3Ethereum", "AaveV3EthereumLido", "MorphoBlueEthereum"
     */
    market:  string
    chain:   Chain
    address: string
  }

  native: {
    type: NativeType
    /**
     * Native identifier in the source protocol.
     * AAVE:        underlying asset address
     * Morpho Blue: marketId hash
     * MetaMorpho:  vault contract address
     * Compound:    cToken or Comet address
     */
    id:   string
  }

  asset:       Asset
  subgraphUrl: string
  active:      boolean
  createdAt:   Date
  updatedAt:   Date
}

export interface LendPool extends BasePool {
  kind: 'lend'
  protocolMeta: ProtocolMetaAaveLend | ProtocolMetaMorphoLend | ProtocolMetaMetaMorpho | ProtocolMetaCompound
}

export interface BorrowPool extends BasePool {
  kind: 'borrow'
  /** Always non-empty on a borrow pool. */
  collaterals:  Collateral[]
  protocolMeta: ProtocolMetaAaveBorrow | ProtocolMetaMorphoBlue | ProtocolMetaCompound
}

export type Pool = LendPool | BorrowPool

// ─────────────────────────────────────────────────────────────────────────────
// Shared APY types — used by apy.hourly and apy.daily
// ─────────────────────────────────────────────────────────────────────────────

export interface RewardItem {
  token: {
    symbol:  string
    address: string
  }
  /**
   * Raw APR as returned by the source protocol — stored for traceability.
   * Morpho:  state.rewards[].supplyApr / borrowApr
   * AAVE:    AaveSupplyIncentive.extraSupplyApr / AaveBorrowIncentive.borrowAprDiscount
   * Merkl:   opportunity.apr
   */
  apr:     number
  /**
   * APR converted to APY using daily compounding (n=365).
   * APY = (1 + APR / 365)^365 - 1
   */
  apy:     number
  source:  'protocol' | 'merkl' | 'merit'
  program: string | null
}

export interface ApyBreakdown {
  /** Average base APY from the protocol IRM — before fees, without rewards. */
  base:        number
  /** Average sum of all reward APYs. */
  rewards:     number
  /** Average protocol fee APY. */
  fees:        number
  /**
   * Average net APY — effective rate for the user.
   * Lend:   base - fees + rewards
   * Borrow: base + fees - rewards
   */
  net:         number
  /**
   * Reward items from the last slot — not averaged.
   * Items can appear/disappear between slots.
   */
  rewardItems: RewardItem[]
}

// ─── Market state — split by kind ─────────────────────────────────────────────

export interface LendMarketState {
  /** Average total amount supplied in native token units. */
  supplyAssets:    number
  /** Average total value supplied in USD. */
  supplyAssetsUsd: number
  /** Average borrow utilization rate — 0 to 1. */
  utilizationRate: number
  /** Average loan asset price in USD. */
  assetPriceUsd:   number
}

export interface BorrowMarketState {
  /** Average total amount supplied in native token units. */
  supplyAssets:    number
  /** Average total value supplied in USD. */
  supplyAssetsUsd: number
  /** Average total amount borrowed in native token units. */
  borrowAssets:    number
  /** Average total value borrowed in USD. */
  borrowAssetsUsd: number
  /** Average borrow utilization rate — 0 to 1. */
  utilizationRate: number
  /** Average loan asset price in USD. */
  assetPriceUsd:   number
  /**
   * Average total collateral in USD.
   * null for AAVE/Compound (multi-collateral).
   */
  collateralAssetsUsd:        number | null
  /**
   * Average collateral/loan price ratio.
   * Morpho Blue only — null for AAVE/Compound.
   */
  priceCollateralInLoanAsset: number | null
}

// ─── Shared meta — lean, filtering fields only ────────────────────────────────

/**
 * Minimal metadata stored on each APY document.
 * Contains only fields needed for MongoDB filtering — no display data.
 * Display fields (asset name, address, chain name…) resolved via pools._id.
 */
interface ApyMeta {
  poolId:   string        // FK → pools._id — upsert key
  kind:     Kind
  protocol: ProtocolName
  chainId:  number        // EVM chain ID — for filtering
  asset:    string        // loan asset symbol only — "USDC", "WETH"
}

// ─────────────────────────────────────────────────────────────────────────────
// apy.hourly collection
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotQuality {
  /**
   * Number of 10-min slots that contributed to the rolling average.
   * Expected: 6 for a complete hour.
   */
  count:         number
  /** Expected slots per hour — always 6. */
  expectedCount: 6
  /** Timestamp of the first slot that contributed to this hour. */
  firstSlot:     Date
  /** Timestamp of the most recent slot that contributed. */
  lastSlot:      Date
  /**
   * building — hour in progress, count < 6
   * complete — count >= 6
   * partial  — hour is past but count < 6 (gaps detected)
   */
  status:        SlotQualityStatus
}

export interface LendApySlot {
  /**
   * Hour boundary UTC — normalized to the top of the hour.
   * 11:17:42Z → 11:00:00.000Z
   * Upsert key: (meta.poolId, hour).
   */
  hour:    Date
  meta:    ApyMeta & { kind: 'lend' }
  apy:     ApyBreakdown
  market:  LendMarketState
  quality: SlotQuality
}

export interface BorrowApySlot {
  /**
   * Hour boundary UTC — normalized to the top of the hour.
   * 11:17:42Z → 11:00:00.000Z
   * Upsert key: (meta.poolId, hour).
   */
  hour:    Date
  meta:    ApyMeta & { kind: 'borrow' }
  apy:     ApyBreakdown
  market:  BorrowMarketState
  quality: SlotQuality
}

export type ApySlot = LendApySlot | BorrowApySlot

// ─────────────────────────────────────────────────────────────────────────────
// SpotPayload — fetcher output, input to the hourly upsert pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized snapshot returned by each protocol fetcher.
 * Contains only the data needed to compute the rolling average in apy.hourly.
 * No timestamp — assigned by the orchestrator at collection time.
 */
export type SpotPayload = {
  poolId:   string
  kind:     Kind
  protocol: ProtocolName
  chainId:  number
  /** Loan asset symbol — "USDC", "WETH". */
  asset:    string
  apy: {
    base:        number
    rewards:     number
    fees:        number
    net:         number
    rewardItems: RewardItem[]
  }
  market: LendMarketState | BorrowMarketState
}

// ─────────────────────────────────────────────────────────────────────────────
// apy.daily collection
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyQuality {
  /**
   * Number of hourly documents found in the [D-1 00:00Z, D 00:00Z[ window.
   * Expected: 24 for a complete day.
   */
  actualCount:  number
  /**
   * actualCount / 24 — 0 to 1.
   * < 0.5 → treat as unreliable, exclude from optimization engine.
   */
  completeness: number
  status:       DailyQualityStatus
  /** Incremented on each recomputation — > 1 means the document was replayed. */
  revision:     number
  computedAt:   Date
}

export interface LendApyDaily {
  /**
   * Midnight UTC of the day covered.
   * 2025-03-12 → 2025-03-12T00:00:00.000Z
   * Upsert key: (meta.poolId, date).
   */
  date:    Date
  meta:    ApyMeta & { kind: 'lend' }
  apy:     ApyBreakdown
  market:  LendMarketState
  quality: DailyQuality
}

export interface BorrowApyDaily {
  /**
   * Midnight UTC of the day covered.
   * 2025-03-12 → 2025-03-12T00:00:00.000Z
   * Upsert key: (meta.poolId, date).
   */
  date:    Date
  meta:    ApyMeta & { kind: 'borrow' }
  apy:     ApyBreakdown
  market:  BorrowMarketState
  quality: DailyQuality
}

export type ApyDaily = LendApyDaily | BorrowApyDaily