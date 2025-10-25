import { gql } from 'urql'

export const GET_USER_POSITIONS = gql`
  query VaultPositions($chainIds: [Int!], $userAddresses: [String!]) {
    vaultPositions(
      where: { chainId_in: $chainIds, userAddress_in: $userAddresses }
    ) {
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
          asset {
            name
            symbol
          }
          state {
            yearlyApy
          }
        }
        state {
          assets
        }
      }
    }
  }
`
