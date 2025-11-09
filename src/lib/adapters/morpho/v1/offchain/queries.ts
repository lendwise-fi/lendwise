import { gql } from 'urql'

export const USER_LEND_POSITIONS = gql`
  query UserLendPositions(
    $where: VaultPositionFilters
    $first: Int
    $skip: Int
  ) {
    vaultPositions(where: $where, first: $first, skip: $skip) {
      items {
        id
        user {
          id
          address
        }
        vault {
          id
          address
          symbol
          name
          chain {
            id
            currency
            network
          }
          asset {
            name
            symbol
            decimals
          }
          state {
            avgNetApy
          }
        }
        state {
          assets
          assetsUsd
          pnlUsd
          pnl
        }
      }
      pageInfo {
        countTotal
        count
        limit
        skip
      }
    }
  }
`

export const USER_BORROW_POSITIONS = gql`
  query UserBorrowPositions(
    $where: MarketPositionFilters
    $first: Int
    $skip: Int
  ) {
    marketPositions(where: $where, first: $first, skip: $skip) {
      items {
        id
        healthFactor
        user {
          id
          address
        }
        market {
          id
          lltv
          collateralAsset {
            name
            symbol
            decimals
          }
          loanAsset {
            name
            symbol
            decimals
          }
          morphoBlue {
            chain {
              id
              network
              currency
            }
          }
          state {
            avgBorrowApy
            avgNetBorrowApy
          }
          uniqueKey
        }
        state {
          collateral
          collateralUsd
          borrowAssets
          borrowAssetsUsd
          marginRoe
        }
      }
      pageInfo {
        countTotal
        count
        limit
        skip
      }
    }
  }
`
