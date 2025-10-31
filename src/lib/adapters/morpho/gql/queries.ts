import { gql } from 'urql'

export const USER_LEND_POSITIONS = gql`
  query UserLendPositions($where: VaultPositionFilters) {
    vaultPositions(where: $where) {
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
            netApyWithoutRewards
          }
        }
        state {
          assets
          assetsUsd
          pnlUsd
          pnl
        }
      }
    }
  }
`

export const USER_BORROW_POSITIONS = gql`
  query UserBorrowPositions($where: MarketPositionFilters) {
    marketPositions(where: $where) {
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
        }
        state {
          collateral
          collateralUsd
          borrowAssets
          borrowAssetsUsd
          marginRoe
        }
      }
    }
  }
`
