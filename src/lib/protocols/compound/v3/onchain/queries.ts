import { gql } from 'urql'

/**
 * Shared queries for Compound V3.
 * These work for Ethereum and Polygon subgraphs.
 * For chains with different schemas (like Base), use chain-specific queries.
 */

export const USER_SUPPLY_POSITIONS = gql`
  query UserSupplyPositions($where: Account_filter) {
    accounts(where: $where) {
      address
      positions(where: { accounting_: { baseBalance_gt: 0 } }) {
        market {
          id
          configuration {
            name
            symbol
            baseToken {
              token {
                symbol
                name
                decimals
                address
              }
            }
          }
          accounting {
            baseSupplyIndex
            supplyApr
            netSupplyApr
            totalBaseSupply
            rewardSupplyApr
            totalBaseSupplyUsd
            trackingSupplyIndex
            totalBasePrincipalSupply
          }
        }
        accounting {
          id
          lastUpdatedBlockNumber
          baseBalance
          baseBalanceUsd
          basePrincipal
          baseTrackingAccrued
        }
      }
    }
  }
`

export const USER_BORROW_POSITIONS = gql`
  query UserBorrowPositions($where: Account_filter) {
    accounts(where: $where) {
      address
      positions(where: { accounting_: { baseBalance_lt: 0 } }) {
        creationBlockNumber
        market {
          id
          configuration {
            name
            symbol
            baseToken {
              token {
                symbol
                name
                decimals
                address
              }
            }
          }
          accounting {
            baseBorrowIndex
            borrowApr
            netBorrowApr
            totalBaseBorrow
            rewardBorrowApr
            totalBaseBorrowUsd
            trackingBorrowIndex
            totalBasePrincipalBorrow
          }
        }
        accounting {
          id
          baseBalance
          baseBalanceUsd
          basePrincipal
          baseTrackingAccrued
          collateralBalances {
            balance
            balanceUsd
            collateralToken {
              borrowCollateralFactor
              liquidationFactor
              token {
                name
                symbol
                decimals
                address
              }
            }
          }
        }
      }
    }
  }
`
export const MARKETS_APY = gql`
  query MarketsApy {
    markets {
      id
      configuration {
        symbol
        baseToken {
          lastPriceUsd
        }
      }
      accounting {
        supplyApr
        netSupplyApr
        rewardSupplyApr
        baseSupplyIndex
        totalBaseSupply
        totalBasePrincipalSupply
        totalBaseSupplyUsd
        trackingSupplyIndex
        borrowApr
        netBorrowApr
        rewardBorrowApr
        baseBorrowIndex
        totalBaseBorrow
        totalBaseBorrowUsd
        trackingBorrowIndex
        totalBasePrincipalBorrow
        utilization
        collateralBalanceUsd
        collateralReservesBalanceUsd
      }
    }
  }
`

export const MARKETS_ALL = gql`
  query MarketsAll {
    markets {
      id
      configuration {
        baseToken {
          token {
            symbol
            name
            decimals
            address
          }
        }
        collateralTokens {
          borrowCollateralFactor
          liquidationFactor
          liquidateCollateralFactor
          token {
            address
            decimals
            name
            symbol
          }
        }
      }
    }
  }
`

export const LIST_BORROWING_PRODUCTS = gql`
  query ListBorrowingProducts {
    markets {
      id
      accounting {
        totalBaseSupply
        totalBaseSupplyUsd
        totalBaseBorrow
        totalBaseBorrowUsd
        netBorrowApr
      }
      configuration {
        baseToken {
          token {
            symbol
            name
            decimals
            address
          }
        }
      }
    }
  }
`

export const LIST_SUPPLYING_PRODUCTS = gql`
  query ListSupplyingProducts {
    markets {
      id
      accounting {
        totalBaseSupply
        totalBaseSupplyUsd
        totalReserveBalanceUsd
        collateralization
        netSupplyApr
      }
      configuration {
        baseToken {
          token {
            symbol
            name
            decimals
            address
          }
        }
        collateralTokens {
          borrowCollateralFactor
          liquidationFactor
          liquidateCollateralFactor
          token {
            address
            decimals
            name
            symbol
          }
        }
      }
    }
  }
`

// export const MARKET_HOURLY_BORROW_RATES = gql`
//   query MarketHourlyBorrowRates($where: MarketHourlySnapshot_filter) {
//     marketHourlySnapshots(where: $where) {
//       rates(where: { side: BORROWER }) {
//         rate
//       }
//       timestamp
//     }
//   }
// `

// export const MARKET_HOURLY_LEND_RATES = gql`
//   query MarketHourlySupplyRates($where: MarketHourlySnapshot_filter) {
//     marketHourlySnapshots(where: $where) {
//       rates(where: { side: LENDER }) {
//         rate
//       }
//       timestamp
//     }
//   }
// `

// export const MARKET_DAILY_BORROW_RATES = gql`
//   query MarketDailyBorrowRates($where: MarketDailySnapshot_filter) {
//     marketDailySnapshots(where: $where) {
//       rates(where: { side: BORROWER }) {
//         rate
//       }
//       timestamp
//     }
//   }
// `

// export const MARKET_DAILY_LEND_RATES = gql`
//   query MarketDailySupplyRates($where: MarketDailySnapshot_filter) {
//     marketDailySnapshots(where: $where) {
//       rates(where: { side: LENDER }) {
//         rate
//       }
//       timestamp
//     }
//   }
// `
