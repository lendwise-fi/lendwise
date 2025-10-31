import { gql } from 'urql'

// Placeholder for Morpho Blue Arbitrum subgraph queries
export const GET_MARKET_STATS = gql`
  {
    tokens(first: 5) {
      id
      name
      symbol
      decimals
    }
  }
`
