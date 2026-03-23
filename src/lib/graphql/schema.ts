import { createSchema } from 'graphql-yoga'

import { resolvers } from './resolvers'

export const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

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

  type RewardToken {
    symbol: String!
    address: String!
  }

  # ─── APY breakdown ───────────────────────────────────────────────────────────

  type RewardItem {
    token: RewardToken!
    "Raw APR as returned by the source protocol — stored for traceability."
    apr: Float!
    "APR converted to APY using daily compounding (1 + APR/365)^365 - 1."
    apy: Float!
    source: RewardSource!
    program: String
  }

  "APY breakdown for HOURLY timeframe — single value per field."
  type HourlyApyBreakdown {
    "Base APY from the protocol IRM — before fees, without rewards."
    base: Float!
    "Sum of all reward APYs (converted from APR)."
    rewards: Float!
    "Protocol fee APY."
    fees: Float!
    "Net APY = base - fees + rewards (supply) / base + fees - rewards (borrow)."
    net: Float!
    "Individual reward items — one per (token, program) pair."
    rewardItems: [RewardItem!]!
  }

  "APY breakdown for DAILY timeframe — daily averaged values."
  type DailyApyBreakdown {
    "Average base APY across all hourly slots of the day."
    base: Float!
    "Average net APY — primary field for comparisons."
    net: Float!
    "Average reward APY across the day."
    rewards: Float!
    "Average protocol fee APY across the day."
    fees: Float!
    "Reward items from the last hourly slot of the day."
    rewardItems: [RewardItem!]!
  }

  # ─── Market state ─────────────────────────────────────────────────────────────

  type SupplyHourlyMarketState {
    "Total amount supplied in native token units."
    supplyAssets: Float!
    "Total value supplied in USD."
    supplyAssetsUsd: Float!
    utilizationRate: Float!
    assetPriceUsd: Float!
  }

  type BorrowHourlyMarketState {
    "Total amount supplied in native token units."
    supplyAssets: Float!
    "Total value supplied in USD."
    supplyAssetsUsd: Float!
    "Total amount borrowed in native token units."
    borrowAssets: Float!
    "Total value borrowed in USD."
    borrowAssetsUsd: Float!
    utilizationRate: Float!
    assetPriceUsd: Float!
    "null for AAVE/Compound — multi-collateral."
    collateralAssetsUsd: Float
    "Morpho Blue only — null for AAVE/Compound."
    priceCollateralInLoanAsset: Float
  }

  type SupplyDailyMarketState {
    "Average total amount supplied in native token units across the day."
    supplyAssets: Float!
    "Average total value supplied in USD across the day."
    supplyAssetsUsd: Float!
    "Average utilization rate across the day."
    utilizationRate: Float!
    "Average asset price in USD across the day."
    assetPriceUsd: Float!
  }

  type BorrowDailyMarketState {
    "Average total amount supplied in native token units across the day."
    supplyAssets: Float!
    "Average total value supplied in USD across the day."
    supplyAssetsUsd: Float!
    "Average total amount borrowed in native token units across the day."
    borrowAssets: Float!
    "Average total value borrowed in USD across the day."
    borrowAssetsUsd: Float!
    "Average total collateral in USD across the day — null for AAVE/Compound."
    collateralAssetsUsd: Float
    "Average utilization rate across the day."
    utilizationRate: Float!
    "Average asset price in USD across the day."
    assetPriceUsd: Float!
    "Average collateral/loan price ratio across the day — null for AAVE/Compound."
    priceCollateralInLoanAsset: Float
  }

  # ─── Quality ──────────────────────────────────────────────────────────────────

  type HourlyQuality {
    count: Int!
    expectedCount: Int!
    firstSlot: DateTime!
    lastSlot: DateTime!
    status: String!
  }

  # ─── Collateral ───────────────────────────────────────────────────────────────

  type Collateral {
    symbol: String!
    name: String!
    address: String!
    decimals: Int!
    "null for Morpho Blue — only lltv is exposed."
    ltv: Float
    lltv: Float!
    canBeCollateral: Boolean!
  }

  # ─── Product ─────────────────────────────────────────────────────────────────

  type ProductAsset {
    symbol: String!
    name: String!
    address: String!
    decimals: Int!
  }

  type ProductChain {
    id: Int!
    name: String!
  }

  type ProductProtocol {
    "Normalized provider identifier — aave | morpho | compound."
    provider: ProtocolName!
    "Product type — reserve | market | vault."
    type: String!
    version: String!
    "Native market/deployment name — e.g. AaveV3Ethereum, MorphoBlueEthereum."
    name: String!
    chain: ProductChain!
    "Protocol contract address — pool / market factory."
    address: String!
    "Protocol-specific metadata — shape varies by provider. Use JSON scalar."
    meta: JSON
  }

  type Product {
    id: String!
    active: Boolean!
    kind: String!
    asset: ProductAsset!
    protocol: ProductProtocol!
    "Accepted collateral assets — null for supply products."
    collaterals: [Collateral!]
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ─── Pagination ──────────────────────────────────────────────────────────────

  type PaginationInfo {
    "Number of items returned in this page."
    count: Int!
    "Total number of items matching the filters (ignoring first/skip)."
    countTotal: Int!
    "Maximum number of items requested (first argument)."
    limit: Int!
    "Number of items skipped (skip argument)."
    skip: Int!
  }

  enum OrderDirection {
    asc
    desc
  }

  # ─── Supply results ─────────────────────────────────────────────────────────────

  type SupplyHourlyResult {
    hour: DateTime!
    productId: String!
    protocol: ProtocolName!
    chainId: Int!
    asset: String!
    product: Product
    apy: HourlyApyBreakdown!
    market: SupplyHourlyMarketState!
    quality: HourlyQuality!
  }

  type SupplyDailyResult {
    date: DateTime!
    productId: String!
    protocol: ProtocolName!
    chainId: Int!
    asset: String!
    product: Product
    apy: DailyApyBreakdown!
    market: SupplyDailyMarketState!
  }

  # ─── Borrow results ───────────────────────────────────────────────────────────

  type BorrowHourlyResult {
    hour: DateTime!
    productId: String!
    protocol: ProtocolName!
    chainId: Int!
    asset: String!
    product: Product
    collaterals: [Collateral!]!
    apy: HourlyApyBreakdown!
    market: BorrowHourlyMarketState!
    quality: HourlyQuality!
  }

  type BorrowDailyResult {
    date: DateTime!
    productId: String!
    protocol: ProtocolName!
    chainId: Int!
    asset: String!
    product: Product
    collaterals: [Collateral!]!
    apy: DailyApyBreakdown!
    market: BorrowDailyMarketState!
  }

  # ─── Paginated responses ─────────────────────────────────────────────────────

  type SupplyHourlyResponse {
    items: [SupplyHourlyResult!]!
    pagination: PaginationInfo!
  }

  type SupplyDailyResponse {
    items: [SupplyDailyResult!]!
    pagination: PaginationInfo!
  }

  type BorrowHourlyResponse {
    items: [BorrowHourlyResult!]!
    pagination: PaginationInfo!
  }

  type BorrowDailyResponse {
    items: [BorrowDailyResult!]!
    pagination: PaginationInfo!
  }

  # ─── Inputs ───────────────────────────────────────────────────────────────────

  "Shared filters for hourly queries."
  input HourlyFilters {
    "Filter by protocol name — aave | morpho | compound."
    protocol: ProtocolName
    "Filter by native market name — e.g. AaveV3Ethereum, MorphoBlueEthereum."
    market: String
    "Filter by chain ID."
    chainId: Int
    "Filter by loan asset symbol — e.g. USDC, WETH."
    asset: String
    "ISO date string — start of range (inclusive). Defaults to last 24h."
    from: String
    "ISO date string — end of range (inclusive)."
    to: String
  }

  "Shared filters for daily queries."
  input DailyFilters {
    protocol: ProtocolName
    market: String
    chainId: Int
    asset: String
    "ISO date string — start of range (inclusive)."
    from: String
    "ISO date string — end of range (inclusive)."
    to: String
    "Convenience shorthand — 7d | 30d | 90d | 180d | 1y. Default: 30d."
    range: String
  }

  input BorrowHourlyFilters {
    protocol: ProtocolName
    market: String
    chainId: Int
    asset: String
    "Filter by collateral asset symbol."
    collateral: String
    from: String
    to: String
  }

  input BorrowDailyFilters {
    protocol: ProtocolName
    market: String
    chainId: Int
    asset: String
    collateral: String
    from: String
    to: String
    range: String
  }

  # ─── Queries ──────────────────────────────────────────────────────────────────

  type Query {
    "Latest hourly APY snapshots for supply products."
    supplyApyHourly(
      filters: HourlyFilters
      first: Int = 100
      skip: Int = 0
      orderBy: String = "hour"
      orderDirection: OrderDirection = asc
    ): SupplyHourlyResponse!
    "Daily aggregated APY for supply products."
    supplyApyDaily(
      filters: DailyFilters
      first: Int = 100
      skip: Int = 0
      orderBy: String = "date"
      orderDirection: OrderDirection = asc
    ): SupplyDailyResponse!
    "Latest hourly APY snapshots for borrow pools."
    borrowApyHourly(
      filters: BorrowHourlyFilters
      first: Int = 100
      skip: Int = 0
      orderBy: String = "hour"
      orderDirection: OrderDirection = asc
    ): BorrowHourlyResponse!
    "Daily aggregated APY for borrow pools."
    borrowApyDaily(
      filters: BorrowDailyFilters
      first: Int = 100
      skip: Int = 0
      orderBy: String = "date"
      orderDirection: OrderDirection = asc
    ): BorrowDailyResponse!
  }
`

export const schema = createSchema({
  typeDefs,
  resolvers,
})
