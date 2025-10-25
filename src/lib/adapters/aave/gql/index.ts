import { createClient, cacheExchange, fetchExchange } from '@urql/core'
import { LendingPosition } from '@/types/lending'
import { USER_SUPPLIES } from './queries'
import { UserSuppliesQuery } from './generated/graphql'

const AAVE_GRAPHQL_URL = 'https://api.v3.aave.com/graphql'

const client = createClient({
  url: AAVE_GRAPHQL_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getUserPositions(
  user: `0x${string}`
): Promise<LendingPosition[]> {
  const { data, error } = await client
    .query(USER_SUPPLIES, {
      request: {
        user: user.toLowerCase(),
        // markets: [] // Optionally filter for specific markets
      },
    })
    .toPromise()

  if (error) {
    console.error('Failed to fetch Aave positions:', error)
    return []
  }

  if (!data || !data.userSupplies) {
    return []
  }

  return data.userSupplies.map(
    (s: UserSuppliesQuery['userSupplies'][number]) => ({
      protocol: 'aave',
      assetSymbol: s.currency.symbol,
      assetAddress: s.market.address as `0x${string}`,
      supplied: BigInt(s.balance.amount.value),
      borrowed: 0n, // This query is for supplies only
      apySupply: s.apy.value / 100, // Assuming APY value is in percent
      apyBorrow: 0,
    })
  )
}

export const gqlAdapter = {
  getUserPositions,
}
