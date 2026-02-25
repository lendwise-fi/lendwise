import { arbitrum } from 'viem/chains'

import { MORPHO_V1_CHAINS } from '../config'
import { createChainClient, registerChain } from '../index'

const config = MORPHO_V1_CHAINS[arbitrum.id]

/**
 * Arbitrum One client for Morpho v1.
 * Automatically registers itself with the onchain adapter.
 */
const morphoClient = createChainClient(
  config.custom.subgraphUrl!,
  process.env.THEGRAPH_API_KEY
)

// Register this chain with the adapter
registerChain({
  client: morphoClient,
  chainId: config.id,
  chainName: config.name,
  // Uses default queries from ../queries.ts
})
