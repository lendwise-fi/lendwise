import { createVersionAdapter } from '../../utils'
import { morphoV1OffchainAdapter } from './offchain'

/**
 * Morpho V1 Adapter
 * - Positions: GraphQL API (real-time user positions)
 * - Stats: Subgraph (historical/statistical data) - To be implemented
 */
export const morphoV1Adapter = createVersionAdapter('v1', {
  positions: morphoV1OffchainAdapter,
  // stats: morphoV1SubgraphAdapter, // TODO: Implement subgraph adapter for stats
})
