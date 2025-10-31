import { cacheExchange, createClient, fetchExchange } from '@urql/core'

import { MarketStats } from '@/types'

const MORPHO_ARBITRUM_SUBGRAPH_URL =
  'https://gateway.thegraph.com/api/[api-key]/subgraphs/id/XsJn88DNCHJ1kgTqYeTgHMQSK4LuG1LR75339QVeQ26'

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
