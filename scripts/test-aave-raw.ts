import { AAVE_CONFIG } from '@/lib/protocols/aave/config'
import { MarketsApyQuery } from '@/lib/protocols/aave/v3/offchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/aave/v3/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'

async function main() {
  const config = AAVE_CONFIG.aave_v3
  const client = createGraphQLClient(config.offchainApiUrl!)

  const chainIds = [8453] // Base

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
      if (reserve.underlyingToken.symbol === 'USDC') {
        console.log(`\nMarket: ${market.name}`)
        console.log('Reserve Factors:')
        console.dir(reserve.supplyInfo, { depth: null })
        console.dir(reserve.borrowInfo, { depth: null })
        console.log('Incentives:')
        console.dir(reserve.incentives, { depth: null })
      }
    }
  }
}

main().catch(console.error)
