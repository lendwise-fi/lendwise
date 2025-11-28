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
            address
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

export const MARKET_BORROW_RATES = gql`
  query MarketBorrowRates($marketId: String!, $options: TimeseriesOptions) {
    market(id: $marketId) {
      historicalState {
        borrowApy(options: $options) {
          x
          y
        }
        netBorrowApy(options: $options) {
          x
          y
        }
        dailyBorrowApy(options: $options) {
          x
          y
        }
        fee(options: $options) {
          x
          y
        }
      }
    }
  }
`

export const MARKET_LEND_RATES = gql`
  query MarketLendRates($marketId: String!, $options: TimeseriesOptions) {
    market(id: $marketId) {
      historicalState {
        supplyApy(options: $options) {
          x
          y
        }
        netSupplyApy(options: $options) {
          x
          y
        }
        dailySupplyApy(options: $options) {
          x
          y
        }
        fee(options: $options) {
          x
          y
        }
      }
    }
  }
`
