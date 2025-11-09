import { optimism } from 'viem/chains'

import { COMPOUND_V3_CHAINS } from '../config'
import { createChainClient, registerChain } from '../index'
import { USER_BORROW_POSITIONS, USER_LEND_POSITIONS } from './queries'
import {
  getUserBorrowPositions,
  getUserLendPositions,
} from './transformers'

const config = COMPOUND_V3_CHAINS[optimism.id]

/**
 * Optimism chain client for Compound V3.
 * Automatically registers itself with the onchain adapter.
 * Uses custom queries and transformers due to different subgraph schema (spencer.papercliplabs.eth).
 */
const optimismClient = createChainClient(
  config.custom.subgraphUrl!,
  process.env.COMPOUND_THEGRAPH_API_KEY
)

// Register this chain with the adapter (with custom queries and transformers)
registerChain({
  client: optimismClient,
  chainId: config.id,
  chainName: config.name,
  queries: {
    USER_LEND_POSITIONS,
    USER_BORROW_POSITIONS,
  },
  transformers: {
    getUserLendPositions,
    getUserBorrowPositions,
  },
})
