import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import type { Address } from 'viem'

import { BorrowPosition, LendPosition } from '@/types'

// NOTE: This is a placeholder endpoint. Replace with the correct Compound GraphQL URL.
const COMPOUND_GRAPHQL_URL =
  'https://api.thegraph.com/subgraphs/name/compound-finance/compound-v3-mainnet'

const client = createClient({
  url: COMPOUND_GRAPHQL_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getUserLendPositions(
  // eslint-disable-next-line unused-imports/no-unused-vars
  addresses: Address[]
): Promise<LendPosition[]> {
  console.warn('CompoundAdapter.getUserPositions is not implemented yet.')
  return Promise.resolve([])
}

async function getUserBorrowPositions(
  // eslint-disable-next-line unused-imports/no-unused-vars
  addresses: Address[]
): Promise<BorrowPosition[]> {
  console.warn('CompoundAdapter.getUserPositions is not implemented yet.')
  return Promise.resolve([])
}

export const gqlAdapter = {
  getUserLendPositions,
  getUserBorrowPositions,
}
