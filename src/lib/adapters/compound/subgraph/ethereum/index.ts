import { createClient, cacheExchange, fetchExchange } from '@urql/core'
import { MarketStats } from '@/types/lending'

// NOTE: Replace with the official Compound Ethereum subgraph URL
const COMPOUND_ETHEREUM_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/messari/compound-ethereum'

const client = createClient({
  url: COMPOUND_ETHEREUM_SUBGRAPH_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getMarketStats(): Promise<MarketStats[]> {
  console.warn('Compound Ethereum subgraph adapter is not fully implemented yet.')
  return Promise.resolve([])
}

export const ethereumAdapter = {
  getMarketStats,
}
