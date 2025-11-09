import { gql } from 'urql'

/**
 * Optimism-specific queries for Compound V3.
 * We use spencer.papercliplabs.eth subgraphs for Optimism
 * This schema is different than Messari one.
 */

export const USER_LEND_POSITIONS = gql`
  query UserLendPositions($where: Account_filter) {
    accounts(where: $where) {
      address
      positions {
        market {
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
            name
            symbol
          }
          protocol {
            accounting {
              avgNetSupplyApr
              avgSupplyApr
              avgRewardSupplyApr
            }
          }
        }
        accounting {
          baseBalance
          baseBalanceUsd
          basePrincipal
          id
        }
      }
    }
  }
`

// Add more Base-specific queries as needed
export const USER_BORROW_POSITIONS = gql`
  query UserBorrowPositions($where: Account_filter) {
    accounts(where: $where) {
      address
      positions {
        market {
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
            name
            symbol
          }
          protocol {
            accounting {
              avgNetBorrowApr
              avgBorrowApr
              avgRewardBorrowApr
            }
          }
        }
        accounting {
          baseBalance
          baseBalanceUsd
          basePrincipal
          id
        }
      }
    }
  }
`
