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
        asset {
          id
          name
          symbol
          decimals
          lastPriceUSD
        }
        market {
          name
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
