import { cacheExchange, createClient, fetchExchange } from '@urql/core'

import { MarketStats } from '@/types'

// NOTE: Replace with the official Morpho Blue Ethereum subgraph URL
const MORPHO_ETHEREUM_SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-mainnet'

const client = createClient({
  url: MORPHO_ETHEREUM_SUBGRAPH_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getMarketStats(): Promise<MarketStats[]> {
  console.warn('Morpho Ethereum subgraph adapter is not implemented yet.')
  return Promise.resolve([])
}

export const ethereumAdapter = {
  getMarketStats,
}
