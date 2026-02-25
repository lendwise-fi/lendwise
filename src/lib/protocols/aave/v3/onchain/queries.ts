import { gql } from 'urql'

export const MARKET_DAILY_RATES = gql`
  query MarketDailyRates(
    $where: MarketDailySnapshot_filter
    $side: InterestRateSide!
  ) {
    marketDailySnapshots(where: $where) {
      rates(where: { side: $side }) {
        rate
      }
      timestamp
    }
  }
`

export const MARKET_HOURLY_RATES = gql`
  query MarketHourlyRates(
    $where: MarketHourlySnapshot_filter
    $side: InterestRateSide!
  ) {
    marketHourlySnapshots(where: $where) {
      rates(where: { side: $side }) {
        rate
      }
      timestamp
    }
  }
`
