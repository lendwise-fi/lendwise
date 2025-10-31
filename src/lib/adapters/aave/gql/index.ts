import { cacheExchange, createClient, fetchExchange } from '@urql/core'
import type { Address } from 'viem'

import { BorrowPosition, LendPosition } from '@/types'

// eslint-disable-next-line unused-imports/no-unused-vars
const AAVE_GRAPHQL_URL = 'https://api.v3.aave.com/graphql'

// eslint-disable-next-line unused-imports/no-unused-vars
const client = createClient({
  url: AAVE_GRAPHQL_URL,
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
