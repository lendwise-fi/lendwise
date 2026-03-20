import { gql } from 'urql'

export const USER_LEND_POSITIONS = gql`
  query UserSupplyPositions(
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
  query MarketSupplyHistoryRates(
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

export const MARKETS_APY = gql`
  query MarketsApy($first: Int, $skip: Int, $where: MarketFilters) {
    markets(first: $first, skip: $skip, where: $where) {
      items {
        morphoBlue {
          address
          id
          chain {
            id
            network
          }
        }
        reallocatableLiquidityAssets
        lltv
        warnings {
          type
          level
        }
        uniqueKey
        loanAsset {
          symbol
          name
          address
          decimals
          chain {
            id
            network
          }
        }
        collateralAsset {
          name
          symbol
          address
          decimals
        }
        state {
          borrowApy
          netBorrowApy
          supplyApy
          netSupplyApy
          supplyApy
          supplyAssets
          supplyAssetsUsd
          borrowAssets
          borrowAssetsUsd
          utilization
          fee
          rewards {
            asset {
              symbol
              address
            }
            supplyApr
            borrowApr
          }
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

export const LIST_SUPPLYING_PRODUCTS = gql`
  query ListSupplyingProducts(
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
          curators {
            name
          }
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
          netApy
          avgNetApy(lookback: SIX_HOURS)
          apyDaily: avgNetApy(lookback: ONE_DAY)
          apyYearly: avgNetApy(lookback: ONE_YEAR)
          avgNetApyExcludingRewards(lookback: SIX_HOURS)
        }
        liquidity {
          usd
          underlying
        }
      }
    }
  }
`
