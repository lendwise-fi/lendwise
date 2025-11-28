import { gql } from 'urql'

/**
 * Shared queries for Compound V3.
 * These work for Ethereum and Polygon subgraphs.
 * For chains with different schemas (like Base), use chain-specific queries.
 */

export const USER_LEND_POSITIONS = gql`
  query UserLendPositions($where: Account_filter) {
    accounts(where: $where) {
      id
      positions(where: { side: COLLATERAL }) {
        id
        side
        isCollateral
        isIsolated
        balance
        asset {
          id
          name
          symbol
          decimals
          lastPriceUSD
        }
        market {
          id
          name
          relation
          protocol {
            network
          }
          rates(where: { side: LENDER }) {
            rate
          }
        }
      }
    }
  }
`

export const USER_BORROW_POSITIONS = gql`
  query UserBorrowPositions($where: Account_filter) {
    accounts(where: $where) {
      id
      borrows {
        id
        amount
        timestamp
        asset {
          id
          name
          symbol
          decimals
          lastPriceUSD
        }
        market {
          id
          name
          inputToken {
            id
          }
          relation
          protocol {
            network
          }
          rates {
            rate
          }
        }
      }
      deposits {
        id
        amount
        asset {
          id
          name
          symbol
          decimals
          lastPriceUSD
        }
      }
    }
  }
`
export const MARKET_HOURLY_BORROW_RATES = gql`
  query MarketHourlyBorrowRates($where: MarketHourlySnapshot_filter) {
    marketHourlySnapshots(where: $where) {
      rates(where: { side: BORROWER }) {
        rate
      }
      timestamp
    }
  }
`

export const MARKET_HOURLY_LEND_RATES = gql`
  query MarketHourlyLendRates($where: MarketHourlySnapshot_filter) {
    marketHourlySnapshots(where: $where) {
      rates(where: { side: LENDER }) {
        rate
      }
      timestamp
    }
  }
`

export const MARKET_DAILY_BORROW_RATES = gql`
  query MarketDailyBorrowRates($where: MarketDailySnapshot_filter) {
    marketDailySnapshots(where: $where) {
      rates(where: { side: BORROWER }) {
        rate
      }
      timestamp
    }
  }
`

export const MARKET_DAILY_LEND_RATES = gql`
  query MarketDailyLendRates($where: MarketDailySnapshot_filter) {
    marketDailySnapshots(where: $where) {
      rates(where: { side: LENDER }) {
        rate
      }
      timestamp
    }
  }
`
