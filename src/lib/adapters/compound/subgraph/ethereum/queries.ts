import { gql } from 'urql'

// Placeholder for Ethereum-specific queries
export const GET_MARKET_STATS = gql`
  {
    markets(first: 20) {
      # ... fields
    }
  }
`
