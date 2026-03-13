/**
 * @file types.ts
 * MongoDB document types for the Kompo APY standard.
 *
 * Collections:
 *   pools      — static registry of all lend/borrow pools
 *   apy.spot   — 10-minute APY snapshots (MongoDB Time Series, TTL 90 days)
 *   apy.daily  — daily aggregations computed from apy.spot (classic collection)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

export type ProtocolName = 'aave' | 'morpho' | 'compound'

export type NativeType = 'reserve' | 'market' | 'vault' | 'comet'

export type Kind = 'lend' | 'borrow'

export type SpotQualityStatus  = 'ok' | 'partial' | 'stale'
export type DailyQualityStatus = 'complete' | 'partial' | 'missing'

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
// apy.spot collection  (MongoDB Time Series)
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
  apr: number
  /**
   * APR converted to APY using daily compounding (n=365).
   * APY = (1 + APR / 365)^365 - 1
   * Use this for all net APY calculations and aggregations.
   */
  apy:     number
  source:  'protocol' | 'merkl' | 'merit'
  program: string | null
}

export interface ApyBreakdown {
  /**
   * Base APY from the protocol IRM — before fees, without rewards.
   * Morpho: state.supplyApy / state.borrowApy
   * AAVE:   supplyInfo.apy.value / borrowInfo.apy.value
   */
  base:    number
  /** sum(rewardItems[].apy) — rewards converted from APR */
  rewards: number
  /**
   * Protocol fee as APY.
   * Morpho Blue:  state.fee
   * AAVE:         reserveFactor × borrowApy (informational — already included in base lend)
   * Compound:     reserveFactor from protocolMeta
   */
  fees:         number
  /**
   * Net APY — effective rate for the user.
   * Lend:   base - fees + rewards
   * Borrow: base + fees - rewards
   */
  net:          number
  rewardItems:  RewardItem[]
}

// ─── Market state — split by kind ─────────────────────────────────────────────

export interface LendSpotMarketState {
  /**
   * Total amount supplied in native token units.
   * Morpho: state.supplyAssets
   * AAVE:   reserve.size.amount.value
   */
  supplyAssets:    number
  /**
   * Total value supplied to this pool in USD.
   * Morpho: state.supplyAssetsUsd
   * AAVE:   reserve.size.usd
   */
  supplyAssetsUsd: number
  /**
   * Borrow utilization rate — 0 to 1.
   * Morpho: state.utilization
   * AAVE:   computed from supply/borrow totals
   */
  utilizationRate: number
  /**
   * Price of the loan asset in USD at time of snapshot.
   * Morpho: derived from supplyAssets / supplyAssetsUsd
   * AAVE:   usdExchangeRate
   */
  assetPriceUsd:   number
}

export interface BorrowSpotMarketState {
  /**
   * Total amount supplied in native token units.
   * Morpho: state.supplyAssets
   * AAVE:   reserve.size.amount.value
   */
  supplyAssets:    number
  /**
   * Total value supplied to this pool in USD.
   * Morpho: state.supplyAssetsUsd
   * AAVE:   reserve.size.usd
   */
  supplyAssetsUsd: number
  /**
   * Total amount borrowed in native token units.
   * Morpho: state.borrowAssets
   * AAVE:   reserve.borrowInfo.total.amount.value
   */
  borrowAssets:    number
  /**
   * Total value borrowed from this pool in USD.
   * Morpho: state.borrowAssetsUsd
   * AAVE:   reserve.borrowInfo.total.usd
   */
  borrowAssetsUsd: number
  /**
   * Borrow utilization rate — 0 to 1.
   * Morpho: state.utilization
   * AAVE:   computed
   */
  utilizationRate: number
  /**
   * Price of the loan asset in USD at time of snapshot.
   * Morpho: derived from supplyAssets / supplyAssetsUsd
   * AAVE:   usdExchangeRate
   */
  assetPriceUsd:   number
  /**
   * Total collateral deposited in this market in USD.
   * null when not available (e.g. AAVE multi-collateral aggregate).
   */
  collateralAssetsUsd:        number | null
  /**
   * Price of the collateral expressed in loan asset units.
   * Morpho Blue only — null for AAVE and Compound (multi-collateral).
   */
  priceCollateralInLoanAsset: number | null
}

// ─── Quality ──────────────────────────────────────────────────────────────────

export interface SpotQuality {
  status:    SpotQualityStatus
  fetchedAt: Date
  revision:  number
}

// ─── Spot meta (shared) ───────────────────────────────────────────────────────

interface SpotMeta {
  poolId:   string         // FK → pools._id
  protocol: ProtocolName
  chain:    Chain
  asset:    Asset          // full asset object — denormalized for resolver mapping
  // Static protocol metadata (maxLTV, aTokenSymbol…) lives in pools._id — not duplicated here
}

// ─── Spot documents — discriminated union ─────────────────────────────────────

export interface LendApySpot {
  /**
   * Slot timestamp — normalized to the 10-minute boundary (UTC).
   * 13:17:42Z → 13:10:00.000Z
   * Time Series timeField. Upsert key: (meta.poolId, timestamp).
   */
  timestamp: Date
  meta:      SpotMeta & { kind: 'lend' }
  apy:       ApyBreakdown
  market:    LendSpotMarketState
  quality:   SpotQuality
}

export interface BorrowApySpot {
  /**
   * Slot timestamp — normalized to the 10-minute boundary (UTC).
   * 13:17:42Z → 13:10:00.000Z
   * Time Series timeField. Upsert key: (meta.poolId, timestamp).
   */
  timestamp: Date
  meta:      SpotMeta & { kind: 'borrow' }
  apy:       ApyBreakdown
  market:    BorrowSpotMarketState
  quality:   SpotQuality
}

export type ApySpot = LendApySpot | BorrowApySpot

// ─────────────────────────────────────────────────────────────────────────────
// apy.daily collection  (classic MongoDB collection)
// ─────────────────────────────────────────────────────────────────────────────

export interface Distribution {
  avg:    number
  min:    number
  max:    number
  p25:    number
  p75:    number
  stdDev: number
}

export interface DailyApyBreakdown {
  /** Distribution of base APY across all spot slots of the day. */
  base:    Distribution
  /** Distribution of net APY — primary field for optimization engine. */
  net:     Distribution
  /** Average reward APY across the day. */
  rewards: number
  /** Average protocol fee APY across the day. */
  fees:    number
}

// ─── Daily market state — split by kind ──────────────────────────────────────

export interface LendDailyMarketState {
  /** Closing value — last spot slot of the day. */
  supplyAssets:    number
  /** Closing value. */
  supplyAssetsUsd: number
  /** Daily distribution — rates fluctuate, use avg for comparisons. */
  utilizationRate: Distribution
  assetPriceUsd:   Distribution
}

export interface BorrowDailyMarketState {
  /** Closing value — last spot slot of the day. */
  supplyAssets:    number
  /** Closing value. */
  supplyAssetsUsd: number
  /** Closing value. */
  borrowAssets:    number
  /** Closing value. */
  borrowAssetsUsd: number
  /** Closing value — null for AAVE/Compound. */
  collateralAssetsUsd:        number | null
  /** Daily distribution — rates fluctuate, use avg for comparisons. */
  utilizationRate:            Distribution
  assetPriceUsd:              Distribution
  /**
   * Morpho Blue only — null for AAVE/Compound.
   */
  priceCollateralInLoanAsset: Distribution | null
}

// ─── Daily quality ────────────────────────────────────────────────────────────

export interface DailyQuality {
  /** Number of spot documents found in the [D-1 00:00Z, D 00:00Z[ window. */
  actualCount:  number
  /**
   * actualCount / 144 — 0 to 1.
   * < 0.5 → treat as unreliable, exclude from optimization engine.
   */
  completeness: number
  status:       DailyQualityStatus
  /** Incremented on each recomputation — > 1 means the document was replayed. */
  revision:     number
  computedAt:   Date
}

// ─── Daily meta (shared) ──────────────────────────────────────────────────────

interface DailyMeta {
  protocol: ProtocolName
  chain:    Chain
  asset:    Asset          // full asset object — denormalized from spot
}

// ─── Daily documents — discriminated union ────────────────────────────────────

export interface LendApyDaily {
  /**
   * Midnight UTC of the day covered.
   * 2025-03-12 → 2025-03-12T00:00:00.000Z
   * Upsert key: (poolId, date).
   */
  date:    Date
  poolId:  string   // FK → pools._id
  meta:    DailyMeta & { kind: 'lend' }
  apy:     DailyApyBreakdown
  market:  LendDailyMarketState
  quality: DailyQuality
}

export interface BorrowApyDaily {
  /**
   * Midnight UTC of the day covered.
   * 2025-03-12 → 2025-03-12T00:00:00.000Z
   * Upsert key: (poolId, date).
   */
  date:    Date
  poolId:  string   // FK → pools._id
  meta:    DailyMeta & { kind: 'borrow' }
  apy:     DailyApyBreakdown
  market:  BorrowDailyMarketState
  quality: DailyQuality
}

export type ApyDaily = LendApyDaily | BorrowApyDaily