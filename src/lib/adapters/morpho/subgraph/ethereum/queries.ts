import { gql } from 'urql'

// Placeholder for Morpho Blue Ethereum subgraph queries
export const GET_MARKET_STATS = gql`
  {
    markets(first: 5) {
      id
      updatedAtBlock
    }
  }
`
