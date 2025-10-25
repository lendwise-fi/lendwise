import { gql } from 'urql'

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
