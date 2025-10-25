import { gql } from 'urql'

export const USER_SUPPLIES = gql`
  query UserSupplies($request: UserSuppliesRequest!) {
    userSupplies(request: $request) {
      market {
        address
        name
        chain {
          chainId
        }
      }
      currency {
        symbol
        name
      }
      balance {
        amount {
          value
        }
        usd
      }
      apy {
        raw
        decimals
        value
        formatted
      }
      isCollateral
      canBeCollateral
    }
  }
`
