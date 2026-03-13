import { gql } from 'urql'

export const USER_LEND_POSITIONS = gql`
  query UserLendPositions($request: UserSuppliesRequest!) {
    userSupplies(request: $request) {
      balance {
        amount {
          raw
          value
          decimals
        }
        usd
        usdPerToken
      }
      apy {
        decimals
        formatted
        raw
        value
      }
      canBeCollateral
      currency {
        address
        chainId
        decimals
        imageUrl
        name
        symbol
      }
      isCollateral
      market {
        address
        icon
        name
        chain {
          chainId
          explorerUrl
          icon
          isTestnet
          name
          nativeWrappedToken
        }
      }
    }
  }
`

export const USER_BORROW_POSITIONS = gql`
  query UserBorrowPositions($request: UserBorrowsRequest!) {
    userBorrows(request: $request) {
      apy {
        decimals
        formatted
        raw
        value
      }
      currency {
        address
        chainId
        name
        imageUrl
        symbol
        decimals
      }
      debt {
        usdPerToken
        amount {
          raw
          decimals
          value
        }
        usd
      }
      market {
        name
        chain {
          name
          icon
          chainId
          explorerUrl
          isTestnet
          nativeWrappedToken
        }
        address
        icon
      }
    }
  }
`
export const USER_MARKET_HEALTH_FACTOR = gql`
  query UserMarketHealthFactor($request: UserMarketStateRequest!) {
    userMarketState(request: $request) {
      healthFactor
    }
  }
`
export const USER_LEND_COLLATERALS = gql`
  query UserLendCollaterals($request: UserSuppliesRequest!) {
    userSupplies(request: $request) {
      isCollateral
      balance {
        amount {
          raw
          value
          decimals
        }
        usd
        usdPerToken
      }
      currency {
        address
        chainId
        decimals
        imageUrl
        name
        symbol
      }
      market {
        address
        chain {
          chainId
        }
      }
    }
  }
`
export const MARKET_BORROW_HISTORY_RATES = gql`
  query MarketBorrowHistoryRates($request: BorrowAPYHistoryRequest!) {
    borrowAPYHistory(request: $request) {
      avgRate {
        value
      }
      date
    }
  }
`
export const MARKET_LEND_HISTORY_RATES = gql`
  query MarketLendHistoryRates($request: SupplyAPYHistoryRequest!) {
    supplyAPYHistory(request: $request) {
      avgRate {
        value
      }
      date
    }
  }
`
export const ALL_MARKETS = gql`
  query Markets($request: MarketsRequest!) {
    markets(request: $request) {
      address
      chain {
        chainId
      }
      name
    }
  }
`

export const MARKETS_APY = gql`
  query MarketsApy($request: MarketsRequest!) {
    markets(request: $request) {
      name
      address
      chain {
        name
        chainId
      }
      reserves {
        underlyingToken {
          symbol
          name
          address
        }
        vToken {
          name
          symbol
          address
          decimals
        }
        aToken {
          name
          symbol
          address
          decimals
        }
        usdExchangeRate
        supplyInfo {
          canBeCollateral
          total {
            value
          }
          supplyCap {
            usd
            amount {
              value
            }
          }
          maxLTV {
            value
          }
          liquidationThreshold {
            value
          }
          apy {
            value
          }
        }
        borrowInfo {
          variableRateSlope1 {
            value
          }
          variableRateSlope2 {
            value
          }
          optimalUsageRate {
            value
          }
          baseVariableBorrowRate {
            value
          }
          apy {
            value
          }
          total {
            amount {
              value
            }
            usd
          }
          reserveFactor {
            value
          }
        }
        size {
          amount {
            value
          }
          usd
        }
        incentives {
          ... on AaveSupplyIncentive {
            rewardTokenAddress
            rewardTokenSymbol
            extraSupplyApr {
              value
            }
          }
          ... on AaveBorrowIncentive {
            rewardTokenAddress
            rewardTokenSymbol
            borrowAprDiscount {
              value
            }
          }
          ... on MeritSupplyIncentive {
            extraSupplyApr {
              value
            }
          }
          ... on MeritBorrowIncentive {
            borrowAprDiscount {
              value
            }
          }
          ... on MeritBorrowAndSupplyIncentiveCondition {
            borrowToken {
              symbol
            }
            supplyToken {
              symbol
            }
            extraApr {
              value
            }
          }
        }
      }
    }
  }
`

export const MARKETS_WITH_TOKENS = gql`
  query MarketsWithTokens($request: MarketsRequest!) {
    markets(request: $request) {
      address
      chain {
        name
        chainId
      }
      reserves {
        underlyingToken {
          address
          symbol
        }
      }
    }
  }
`

export const APY_HISTORY = gql`
  query ApyHistory(
    $supplyRequest: SupplyAPYHistoryRequest!
    $borrowRequest: BorrowAPYHistoryRequest!
  ) {
    supplyAPYHistory(request: $supplyRequest) {
      date
      avgRate {
        value
      }
    }
    borrowAPYHistory(request: $borrowRequest) {
      date
      avgRate {
        value
      }
    }
  }
`

export const LIST_LENDING_MARKETS = gql`
  query ListLendingMarkets($request: MarketsRequest!) {
    markets(request: $request) {
      address
      name
      chain {
        name
        chainId
      }
      reserves {
        supplyInfo {
          apy {
            value
          }
          supplyCap {
            usd
            amount {
              raw
            }
          }
        }
        size {
          usd
          amount {
            raw
          }
        }
        underlyingToken {
          address
          name
          symbol
          decimals
        }
      }
    }
  }
`
