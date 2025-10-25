import { createClient, cacheExchange, fetchExchange } from '@urql/core'
import { MarketStats } from '@/types/lending'

// NOTE: Replace with the official Compound Arbitrum subgraph URL
const COMPOUND_ARBITRUM_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/messari/compound-arbitrum'

const client = createClient({
  url: COMPOUND_ARBITRUM_SUBGRAPH_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getMarketStats(): Promise<MarketStats[]> {
  console.warn('Compound Arbitrum subgraph adapter is not fully implemented yet.')
  return Promise.resolve([])
}

export const arbitrumAdapter = {
  getMarketStats,
}
