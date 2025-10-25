import { gql } from 'urql'

// Placeholder for Arbitrum-specific queries
export const GET_MARKET_STATS = gql`
  {
    markets(first: 20) {
      inputToken {
        symbol
      }
      totalValueLockedUSD
      rates {
        rate
        side
        type
      }
    }
  }
`
