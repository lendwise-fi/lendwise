import { AAVE_CONFIG } from '@/lib/protocols/aave/config'
import { MarketsApyQuery } from '@/lib/protocols/aave/v3/offchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/aave/v3/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'

async function main() {
  const config = AAVE_CONFIG.aave_v3
  const client = createGraphQLClient(config.offchainApiUrl!)

  // Polygon, Avalanche, Optimism often have native incentives
  const chainIds = [137, 43114, 10]

  const { data, error } = await client
    .query<MarketsApyQuery>(MARKETS_APY, {
      request: { chainIds },
    })
    .toPromise()

  if (error) {
    console.error('Error:', error)
    return
  }

  for (const market of data?.markets || []) {
    for (const reserve of market.reserves) {
      if (reserve.incentives && reserve.incentives.length > 0) {
        console.log(
          `\nMarket: ${market.name} - ${reserve.underlyingToken.symbol}`
        )
        console.dir(reserve.incentives, { depth: null })
      }
    }
  }
}

main().catch(console.error)
