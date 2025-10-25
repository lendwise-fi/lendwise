import { createClient, cacheExchange, fetchExchange } from '@urql/core'
import { LendingPosition } from '@/types/lending'
import { GET_USER_POSITIONS } from './queries'
import { VaultPositionsQuery } from './generated/graphql'

const MORPHO_GRAPHQL_URL = 'https://api.morpho.org/graphql'

const client = createClient({
  url: MORPHO_GRAPHQL_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getUserPositions(
  user: `0x${string}`
): Promise<LendingPosition[]> {
  const { data, error } = await client
    .query<VaultPositionsQuery>(GET_USER_POSITIONS, {
      chainIds: [1, 42161],
      userAddresses: [user],
    })
    .toPromise()

  if (error) {
    console.error('Failed to fetch Morpho positions:', error)
    return []
  }

  if (!data || !data.vaultPositions || !data.vaultPositions.items) {
    return []
  }

  return data.vaultPositions.items.map((position) => ({
    protocol: 'morpho',
    assetSymbol: position.vault.asset.symbol,
    assetAddress: position.vault.address as `0x${string}`,
    supplied: BigInt(position.state?.assets ?? 0),
    borrowed: 0n, // The query doesn't seem to provide borrow data, defaulting to 0
    apySupply: position.vault.state?.yearlyApy ?? 0,
    apyBorrow: 0, // No borrow APY data
  }))
}

export const gqlAdapter = {
  getUserPositions,
}
