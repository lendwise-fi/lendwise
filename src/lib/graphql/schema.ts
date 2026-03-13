import { createSchema } from 'graphql-yoga'

import { resolvers } from './resolvers'

export const typeDefs = /* GraphQL */ `
  scalar DateTime

  # ─── Enums ──────────────────────────────────────────────────────────────────

  enum Timeframe {
    SPOT
    DAILY
  }

  enum ProtocolName {
    aave
    morpho
    compound
  }

  enum RewardSource {
    protocol
    merkl
    merit
  }

  # ─── Shared types ────────────────────────────────────────────────────────────

  type Chain {
    id: Int!
    name: String!
  }

  type Asset {
    symbol: String!
    name: String!
    address: String!
    decimals: Int!
  }

  # ─── APY breakdown ───────────────────────────────────────────────────────────

  type RewardItem {
    token: Asset!
    "Raw APR as returned by the source protocol — stored for traceability."
    apr: Float!
    "APR converted to APY using daily compounding (1 + APR/365)^365 - 1."
    apy: Float!
    source: RewardSource!
    program: String
  }

  "APY breakdown for SPOT timeframe — single value per field."
  type SpotApyBreakdown {
    "Base APY from the protocol IRM — before fees, without rewards."
    base: Float!
    "Sum of all reward APYs (converted from APR)."
    rewards: Float!
    "Protocol fee APY — deducted from base."
    fees: Float!
    "Net APY = base - fees + rewards (lend) / base + fees - rewards (borrow)."
    net: Float!
    "Individual reward items — one per (token, program) pair."
    rewardItems: [RewardItem!]!
  }

  "Statistical distribution used in DAILY timeframe."
  type Distribution {
    avg: Float!
    min: Float!
    max: Float!
    p25: Float!
    p75: Float!
    stdDev: Float!
  }

  "APY breakdown for DAILY timeframe — full statistical distribution."
  type DailyApyBreakdown {
    "Distribution of base APY across all spot slots of the day."
    base: Distribution!
    "Distribution of net APY across all spot slots — primary field for comparisons."
    net: Distribution!
    "Average reward APY across the day."
    rewards: Float!
    "Average protocol fee APY across the day."
    fees: Float!
  }

  # ─── Market state ─────────────────────────────────────────────────────────────

  "Market state for SPOT timeframe."
  type SpotMarketState {
    supplyAssetsUsd: Float!
    borrowAssetsUsd: Float!
    availableLiquidity: Float!
    utilizationRate: Float!
    assetPriceUsd: Float!
  }

  "Market state for DAILY timeframe — closing values for volumes, distributions for rates."
  type DailyMarketState {
    "Closing value — last spot of the day."
    supplyAssetsUsd: Float!
    "Closing value — last spot of the day."
    borrowAssetsUsd: Float!
    "Closing value — last spot of the day."
    availableLiquidity: Float!
    "Daily distribution — utilization fluctuates throughout the day."
    utilizationRate: Distribution!
    "Daily distribution."
    assetPriceUsd: Distribution!
  }

  # ─── Quality ──────────────────────────────────────────────────────────────────

  type SpotQuality {
    status: String!
    fetchedAt: DateTime!
    revision: Int!
  }

  type DailyQuality {
    actualCount: Int!
    completeness: Float!
    status: String!
    revision: Int!
    computedAt: DateTime!
  }

  # ─── Lend results ─────────────────────────────────────────────────────────────

  type LendSpotResult {
    timestamp: DateTime!
    poolId: String!
    protocol: ProtocolName!
    chain: Chain!
    asset: Asset!
    apy: SpotApyBreakdown!
    market: SpotMarketState!
    quality: SpotQuality!
  }

  type LendDailyResult {
    date: DateTime!
    poolId: String!
    protocol: ProtocolName!
    chain: Chain!
    asset: Asset!
    apy: DailyApyBreakdown!
    market: DailyMarketState!
    quality: DailyQuality!
  }

  union LendApyResult = LendSpotResult | LendDailyResult

  # ─── Borrow results ───────────────────────────────────────────────────────────

  type Collateral {
    symbol: String!
    name: String!
    address: String!
    decimals: Int!
    ltv: Float
    lltv: Float!
    canBeCollateral: Boolean!
  }

  type BorrowSpotResult {
    timestamp: DateTime!
    poolId: String!
    protocol: ProtocolName!
    chain: Chain!
    asset: Asset!
    "List of accepted collateral assets for this borrow pool."
    collaterals: [Collateral!]!
    apy: SpotApyBreakdown!
    market: SpotMarketState!
    quality: SpotQuality!
  }

  type BorrowDailyResult {
    date: DateTime!
    poolId: String!
    protocol: ProtocolName!
    chain: Chain!
    asset: Asset!
    "List of accepted collateral assets for this borrow pool."
    collaterals: [Collateral!]!
    apy: DailyApyBreakdown!
    market: DailyMarketState!
    quality: DailyQuality!
  }

  union BorrowApyResult = BorrowSpotResult | BorrowDailyResult

  # ─── Inputs ───────────────────────────────────────────────────────────────────

  input LendApyRequest {
    timeframe: Timeframe!
    "Filter by protocol name — aave | morpho | compound."
    protocol: ProtocolName
    "Filter by native market name — e.g. AaveV3Ethereum, MorphoBlueEthereum."
    market: String
    "Filter by chain ID."
    chainId: Int
    "Filter by loan asset symbol — e.g. USDC, WETH."
    asset: String
    "ISO date string — start of range (inclusive)."
    from: String
    "ISO date string — end of range (inclusive)."
    to: String
    "Convenience shorthand — 7d | 30d | 90d | 180d | 1y."
    range: String
  }

  input BorrowApyRequest {
    timeframe: Timeframe!
    protocol: ProtocolName
    market: String
    chainId: Int
    "Filter by loan asset symbol — the asset being borrowed."
    asset: String
    "Filter by collateral asset symbol."
    collateral: String
    from: String
    to: String
    range: String
  }

  # ─── Queries ──────────────────────────────────────────────────────────────────

  type Query {
    lendApy(request: LendApyRequest!): [LendApyResult!]!
    borrowApy(request: BorrowApyRequest!): [BorrowApyResult!]!
  }
`

export const schema = createSchema({
  typeDefs,
  resolvers,
})
