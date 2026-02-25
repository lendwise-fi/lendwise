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

  type VaultMetadata {
    symbol: String!
    name: String!
    address: String!
  }

  type DocumentMetadata {
    chain: ChainMetadata!
    protocol: ProtocolMetadata!
    vault: VaultMetadata!
  }

  type ApyData {
    native: Float
    rewards: Float
    fees: Float
    total: Float
  }

  type ApyDocument {
    timestamp: DateTime!
    metadata: DocumentMetadata!
    supplyApy: ApyData
    borrowApy: ApyData
    supplyAssets: Float
    supplyAssetsUsd: Float
    borrowAssets: Float
    borrowAssetsUsd: Float
    collateralAssets: Float
    collateralAssetsUsd: Float
  }

  type Query {
    apy(
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
