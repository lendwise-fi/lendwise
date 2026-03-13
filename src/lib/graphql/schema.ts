import { createSchema } from 'graphql-yoga'
import { resolvers } from './resolvers'

export const typeDefs = /* GraphQL */ `
  scalar DateTime

  # ─── Enums ──────────────────────────────────────────────────────────────────

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
    id:   Int!
    name: String!
  }

  type Asset {
    symbol:   String!
    name:     String!
    address:  String!
    decimals: Int!
  }

  # ─── APY breakdown ───────────────────────────────────────────────────────────

  type RewardItem {
    token:   Asset!
    "Raw APR as returned by the source protocol — stored for traceability."
    apr:     Float!
    "APR converted to APY using daily compounding (1 + APR/365)^365 - 1."
    apy:     Float!
    source:  RewardSource!
    program: String
  }

  "APY breakdown for SPOT timeframe — single value per field."
  type SpotApyBreakdown {
    "Base APY from the protocol IRM — before fees, without rewards."
    base:        Float!
    "Sum of all reward APYs (converted from APR)."
    rewards:     Float!
    "Protocol fee APY."
    fees:        Float!
    "Net APY = base - fees + rewards (lend) / base + fees - rewards (borrow)."
    net:         Float!
    "Individual reward items — one per (token, program) pair."
    rewardItems: [RewardItem!]!
  }

  "Statistical distribution used in DAILY timeframe."
  type Distribution {
    avg:    Float!
    min:    Float!
    max:    Float!
    p25:    Float!
    p75:    Float!
    stdDev: Float!
  }

  "APY breakdown for DAILY timeframe — full statistical distribution."
  type DailyApyBreakdown {
    "Distribution of base APY across all spot slots of the day."
    base:    Distribution!
    "Distribution of net APY — primary field for comparisons."
    net:     Distribution!
    "Average reward APY across the day."
    rewards: Float!
    "Average protocol fee APY across the day."
    fees:    Float!
  }

  # ─── Market state ─────────────────────────────────────────────────────────────

  type LendSpotMarketState {
    "Total amount supplied in native token units."
    supplyAssets:    Float!
    "Total value supplied in USD."
    supplyAssetsUsd: Float!
    utilizationRate: Float!
    assetPriceUsd:   Float!
  }

  type BorrowSpotMarketState {
    "Total amount supplied in native token units."
    supplyAssets:    Float!
    "Total value supplied in USD."
    supplyAssetsUsd: Float!
    "Total amount borrowed in native token units."
    borrowAssets:    Float!
    "Total value borrowed in USD."
    borrowAssetsUsd: Float!
    utilizationRate: Float!
    assetPriceUsd:   Float!
    "null for AAVE/Compound — multi-collateral."
    collateralAssetsUsd:        Float
    "Morpho Blue only — null for AAVE/Compound."
    priceCollateralInLoanAsset: Float
  }

  type LendDailyMarketState {
    "Closing value — last spot slot of the day."
    supplyAssets:    Float!
    "Closing value."
    supplyAssetsUsd: Float!
    "Daily distribution."
    utilizationRate: Distribution!
    "Daily distribution."
    assetPriceUsd:   Distribution!
  }

  type BorrowDailyMarketState {
    "Closing value — last spot slot of the day."
    supplyAssets:    Float!
    "Closing value."
    supplyAssetsUsd: Float!
    "Closing value."
    borrowAssets:    Float!
    "Closing value."
    borrowAssetsUsd: Float!
    "Closing value — null for AAVE/Compound."
    collateralAssetsUsd:        Float
    "Daily distribution."
    utilizationRate:            Distribution!
    "Daily distribution."
    assetPriceUsd:              Distribution!
    "Morpho Blue only — null for AAVE/Compound."
    priceCollateralInLoanAsset: Distribution
  }

  # ─── Quality ──────────────────────────────────────────────────────────────────

  type SpotQuality {
    status:    String!
    fetchedAt: DateTime!
    revision:  Int!
  }

  type DailyQuality {
    actualCount:  Int!
    completeness: Float!
    status:       String!
    revision:     Int!
    computedAt:   DateTime!
  }

  # ─── Collateral ───────────────────────────────────────────────────────────────

  type Collateral {
    symbol:          String!
    name:            String!
    address:         String!
    decimals:        Int!
    "null for Morpho Blue — only lltv is exposed."
    ltv:             Float
    lltv:            Float!
    canBeCollateral: Boolean!
  }

  # ─── Lend results ─────────────────────────────────────────────────────────────

  type LendSpotResult {
    timestamp: DateTime!
    poolId:    String!
    protocol:  ProtocolName!
    chain:     Chain!
    asset:     Asset!
    apy:       SpotApyBreakdown!
    market:    LendSpotMarketState!
    quality:   SpotQuality!
  }

  type LendDailyResult {
    date:     DateTime!
    poolId:   String!
    protocol: ProtocolName!
    chain:    Chain!
    asset:    Asset!
    apy:      DailyApyBreakdown!
    market:   LendDailyMarketState!
    quality:  DailyQuality!
  }

  # ─── Borrow results ───────────────────────────────────────────────────────────

  type BorrowSpotResult {
    timestamp:   DateTime!
    poolId:      String!
    protocol:    ProtocolName!
    chain:       Chain!
    asset:       Asset!
    collaterals: [Collateral!]!
    apy:         SpotApyBreakdown!
    market:      BorrowSpotMarketState!
    quality:     SpotQuality!
  }

  type BorrowDailyResult {
    date:        DateTime!
    poolId:      String!
    protocol:    ProtocolName!
    chain:       Chain!
    asset:       Asset!
    collaterals: [Collateral!]!
    apy:         DailyApyBreakdown!
    market:      BorrowDailyMarketState!
    quality:     DailyQuality!
  }

  # ─── Inputs ───────────────────────────────────────────────────────────────────

  "Shared filters for spot queries."
  input SpotFilters {
    "Filter by protocol name — aave | morpho | compound."
    protocol: ProtocolName
    "Filter by native market name — e.g. AaveV3Ethereum, MorphoBlueEthereum."
    market:   String
    "Filter by chain ID."
    chainId:  Int
    "Filter by loan asset symbol — e.g. USDC, WETH."
    asset:    String
    "ISO date string — start of range (inclusive). Defaults to last 24h."
    from:     String
    "ISO date string — end of range (inclusive)."
    to:       String
  }

  "Shared filters for daily queries."
  input DailyFilters {
    protocol: ProtocolName
    market:   String
    chainId:  Int
    asset:    String
    "ISO date string — start of range (inclusive)."
    from:     String
    "ISO date string — end of range (inclusive)."
    to:       String
    "Convenience shorthand — 7d | 30d | 90d | 180d | 1y. Default: 30d."
    range:    String
  }

  input BorrowSpotFilters {
    protocol:   ProtocolName
    market:     String
    chainId:    Int
    asset:      String
    "Filter by collateral asset symbol."
    collateral: String
    from:       String
    to:         String
  }

  input BorrowDailyFilters {
    protocol:   ProtocolName
    market:     String
    chainId:    Int
    asset:      String
    collateral: String
    from:       String
    to:         String
    range:      String
  }

  # ─── Queries ──────────────────────────────────────────────────────────────────

  type Query {
    "Latest 10-min APY snapshots for lend pools."
    lendApySpot(filters: SpotFilters):   [LendSpotResult!]!
    "Daily aggregated APY for lend pools."
    lendApyDaily(filters: DailyFilters): [LendDailyResult!]!
    "Latest 10-min APY snapshots for borrow pools."
    borrowApySpot(filters: BorrowSpotFilters):   [BorrowSpotResult!]!
    "Daily aggregated APY for borrow pools."
    borrowApyDaily(filters: BorrowDailyFilters): [BorrowDailyResult!]!
  }
`

export const schema = createSchema({
  typeDefs,
  resolvers,
})