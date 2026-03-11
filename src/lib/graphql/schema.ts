import { createSchema } from 'graphql-yoga'

import { resolvers } from './resolvers'

export const typeDefs = /* GraphQL */ `
  scalar DateTime

  enum Timeframe {
    SPOT
    HOURLY
    DAILY
    WEEKLY
    MONTHLY
    YEARLY
  }

  type ChainMetadata {
    id: Int!
    name: String!
  }

  type ProtocolMetadata {
    name: String!
    address: String!
  }

  type LoanAsset {
    symbol: String!
    name: String!
    address: String!
    price_in_dollars: Float!
  }

  "Lender-side metadata (SPOT vault docs)."
  type VaultMetadata {
    loan_asset: LoanAsset!
  }

  "Borrower-side metadata (SPOT market docs)."
  type MarketMetadata {
    loan_asset: LoanAsset!
    collateral_asset: LoanAsset
  }

  type DocumentMetadata {
    chain: ChainMetadata!
    protocol: ProtocolMetadata!
    "Set for kind=VAULT (spot vault docs)."
    vault: VaultMetadata
    "Set for kind=MARKET (spot market docs)."
    market: MarketMetadata
  }

  type ApyData {
    native: Float!
    rewards: Float!
    fees: Float!
    net: Float!
  }

  type ApyDocument {
    "lend = lender-only, borrow = supply + borrow."
    kind: String
    timestamp: DateTime!
    metadata: DocumentMetadata!
    supplyApy: ApyData!
    borrowApy: ApyData
    supplyAssets: Float!
    supplyAssetsUsd: Float!
    borrowAssets: Float
    borrowAssetsUsd: Float
    collateralAssets: Float
    collateralAssetsUsd: Float
    price_collateral_in_loan_asset: Float
  }

  type Query {
    lendApy(
      timeframe: Timeframe!
      protocol: String
      market: String
      chain: String
      range: String
      from: String
      to: String
    ): [ApyDocument!]!

    borrowApy(
      timeframe: Timeframe!
      protocol: String
      market: String
      chain: String
      range: String
      from: String
      to: String
    ): [ApyDocument!]!
  }
`

export const schema = createSchema({
  typeDefs,
  resolvers,
})
