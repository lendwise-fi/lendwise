import { createClient, cacheExchange, fetchExchange } from '@urql/core'
import { LendingPosition } from '@/types/lending'
import { GET_USER_POSITIONS } from './queries'

// NOTE: This is a placeholder endpoint. Replace with the correct Compound GraphQL URL.
const COMPOUND_GRAPHQL_URL = 'https://api.thegraph.com/subgraphs/name/compound-finance/compound-v3-mainnet'

const client = createClient({
  url: COMPOUND_GRAPHQL_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getUserPositions(user: `0x${string}`): Promise<LendingPosition[]> {
  // const { data } = await client.query(GET_USER_POSITIONS, { user: user.toLowerCase() }).toPromise();
  
  console.warn('CompoundAdapter.getUserPositions is not implemented yet.')
  return Promise.resolve([])
}

export const gqlAdapter = {
  getUserPositions,
}
