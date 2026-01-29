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
            address
            name
            symbol
            decimals
          }
          state {
            avgNetApy
            dailyNetApy
            monthlyNetApy
            yearlyNetApy
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
            address
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

export const MARKET_BORROW_HISTORY_RATES = gql`
  query MarketBorrowHistoryRates(
    $marketId: String!
    $options: TimeseriesOptions
  ) {
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

export const MARKET_LEND_HISTORY_RATES = gql`
  query MarketLendHistoryRates(
    $marketId: String!
    $options: TimeseriesOptions
  ) {
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

export const LIST_LENDING_MARKETS = gql`
  query ListLendingMarkets(
    $first: Int
    $skip: Int
    $where: VaultFilters
    $orderBy: VaultOrderBy
    $orderDirection: OrderDirection
  ) {
    vaults(
      first: $first
      skip: $skip
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      pageInfo {
        countTotal
        count
        limit
        skip
      }
      items {
        id
        address
        symbol
        name
        asset {
          address
          name
          symbol
          decimals
          chain {
            currency
            network
            id
          }
        }
        state {
          avgNetApy
          dailyNetApy
          monthlyNetApy
          yearlyNetApy
          totalAssetsUsd
          totalAssets
          allocation {
            market {
              collateralAsset {
                symbol
              }
            }
          }
          apy
          avgApy
          netApy
          netApyWithoutRewards
        }
        liquidity {
          usd
          underlying
        }
      }
    }
  }
`
