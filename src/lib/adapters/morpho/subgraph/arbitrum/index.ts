import { createClient, cacheExchange, fetchExchange } from '@urql/core'
import { MarketStats } from '@/types/lending'

// NOTE: There is no official Morpho Blue Arbitrum subgraph yet.
const MORPHO_ARBITRUM_SUBGRAPH_URL = ''

const client = createClient({
  url: MORPHO_ARBITRUM_SUBGRAPH_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getMarketStats(): Promise<MarketStats[]> {
  if (!MORPHO_ARBITRUM_SUBGRAPH_URL) return []
  console.warn('Morpho Arbitrum subgraph adapter is not implemented yet.')
  return Promise.resolve([])
}

export const arbitrumAdapter = {
  getMarketStats,
}
