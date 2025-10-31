import { cacheExchange, fetchExchange } from '@urql/core'
import { createClient, gql } from 'urql'

const client = createClient({
  url: 'https://api.morpho.org/graphql',
  fetchOptions: {
    headers: {
      Authorization: `Bearer ${process.env.THEGRAPH_API_KEY}`,
    },
  },
  preferGetMethod: false,
  exchanges: [cacheExchange, fetchExchange],
})

const DATA_QUERY = gql`
  query {
    accounts(where: { address: "VOTRE_ADRESSE_EN_MINUSCULES" }) {
      id
      address
      vault {
        id
        name
        symbol
        asset {
          id
          symbol
          decimals
        }
        totalAssets
        totalShares
      }
      shares
      lastUpdateTimestamp
    }
  }
`
const DATA_QUERY_1 = gql`
  query VaultPositions($chainIds: [Int!], $userAddresses: [String!]) {
    vaultPositions(
      where: { chainId_in: $chainIds, userAddress_in: $userAddresses }
    ) {
      items {
        id
        user {
          id
          address
          tag
        }
        vault {
          id
          address
          symbol
          name
          creationBlockNumber
          creationTimestamp
          creatorAddress
          whitelisted
          asset {
            name
            symbol
          }
          state {
            dailyApy
            monthlyApy
            yearlyApy
          }
        }
        state {
          id
          timestamp
          pnl
          pnlUsd
          roe
          roeUsd
          assets
          assetsUsd
          shares
        }
      }
    }
  }
`

export default async function Page() {
  const result = await client
    .query(DATA_QUERY_1, {
      chainIds: [42161],
      userAddresses: ['0xb09303f65801e1d995f7f3838ae60a3d3b0a3f28'],
    })
    .toPromise()

  if (result.error) {
    return (
      <div>
        <p>Error: {result.error.message}</p>
      </div>
    )
  }

  if (!result.data) {
    return <p>Loading...</p>
  }

  return (
    <div>
      <pre>{JSON.stringify(result.data, null, 2)}</pre>
    </div>
  )
}
