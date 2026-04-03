import { gql } from 'urql'

export const USER_SUPPLY_POSITIONS = gql`
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
          marketId
        }
        state {
          collateral
          collateralUsd
          borrowAssets
          borrowAssetsUsd
          marginUsd
          margin
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

export const MARKET_BORROW_HISTORY = gql`
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

export const MARKETS_APY = gql`
  query MarketsApy($first: Int, $skip: Int, $where: MarketFilters) {
    markets(first: $first, skip: $skip, where: $where) {
      items {
        id
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
        marketId
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

export const VAULTS_APY = gql`
  query VaultsApy($first: Int, $skip: Int, $where: VaultFilters) {
    vaults(first: $first, skip: $skip, where: $where) {
      items {
        address
        asset {
          address
          chain {
            network
            id
          }
          decimals
          name
          priceUsd
          symbol
          yield {
            apr
          }
        }
        state {
          apy
          avgNetApy
          avgNetApyExcludingRewards
          fee
          netApy
          netApyExcludingRewards
          totalAssets
          totalAssetsUsd
          rewards {
            amountPerSuppliedToken
            asset {
              decimals
              address
              name
              priceUsd
              symbol
              yield {
                apr
              }
            }
          }
        }
      }
      pageInfo {
        count
        countTotal
        limit
        skip
      }
    }
  }
`

export const VAULT_SUPPLY_HISTORY = gql`
  query VaultHistory($address: String!, $options: TimeseriesOptions) {
    vaultByAddress(address: $address) {
      address
      asset {
        symbol
        chain {
          id
          network
        }
      }
      historicalState {
        apy(options: $options) {
          x
          y
        }
        netApy(options: $options) {
          x
          y
        }
        fee(options: $options) {
          x
          y
        }
        totalAssetsUsd(options: $options) {
          x
          y
        }
        totalAssets(options: $options) {
          x
          y
        }
      }
    }
  }
`

export const LIST_BORROWING_PRODUCTS = gql`
  query ListBorrowingProducts($first: Int, $skip: Int, $where: MarketFilters) {
    markets(first: $first, skip: $skip, where: $where) {
      pageInfo {
        countTotal
        count
        limit
        skip
      }
      items {
        id
        marketId
        loanAsset {
          address
          name
          symbol
          decimals
          chain {
            id
            network
          }
        }
        collateralAsset {
          name
          symbol
        }
        morphoBlue {
          chain {
            id
            network
          }
        }
        state {
          borrowApy
          netBorrowApy
          supplyAssets
          supplyAssetsUsd
          borrowAssets
          borrowAssetsUsd
        }
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
