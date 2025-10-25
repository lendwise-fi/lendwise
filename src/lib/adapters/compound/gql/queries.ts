import { gql } from 'urql'

// NOTE: This is a placeholder query. You will need to adapt it to the Compound schema.
export const GET_USER_POSITIONS = gql`
  query GetUserPositions($user: ID!) {
    account(id: $user) {
      id
      positions {
        market {
          symbol
          inputToken {
            id
          }
        }
        balance
        # ... add other fields for supply/borrow APY etc.
      }
    }
  }
`
