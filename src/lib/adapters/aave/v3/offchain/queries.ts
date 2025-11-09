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
