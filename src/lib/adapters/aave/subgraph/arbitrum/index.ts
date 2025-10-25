import { createClient, cacheExchange, fetchExchange } from '@urql/core'
import { MarketStats } from '@/types/lending'

// NOTE: Replace with the official Aave Arbitrum subgraph URL
const AAVE_ARBITRUM_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/messari/aave-v3-arbitrum'

const client = createClient({
  url: AAVE_ARBITRUM_SUBGRAPH_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getMarketStats(): Promise<MarketStats[]> {
  console.warn('Aave Arbitrum subgraph adapter is not fully implemented yet.')
  return Promise.resolve([])
}

export const arbitrumAdapter = {
  getMarketStats,
}
