import { polygon } from 'viem/chains'

import { AAVE_V3_CHAINS } from '../config'
import { createChainClient, registerChain } from '../index'

const config = AAVE_V3_CHAINS[polygon.id]

/**
 * Polygon client for Aave v3.
 * Automatically registers itself with the onchain adapter.
 */
const aaveClient = createChainClient(
  config.custom.subgraphUrl!,
  process.env.THEGRAPH_API_KEY
)

// Register this chain with the adapter
registerChain({
  client: aaveClient,
  chainId: config.id,
  chainName: config.name,
  // Uses default queries from ../queries.ts
})
