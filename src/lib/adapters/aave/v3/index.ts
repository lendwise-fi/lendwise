import { createVersionAdapter } from '../../utils'
import { aaveV3OffchainAdapter } from './offchain'

/**
 * AAVE V3 Adapter
 * - Positions: GraphQL API (real-time user positions)
 * - Stats: Subgraph (historical/statistical data) - To be implemented
 */
export const aaveV3Adapter = createVersionAdapter('v3', {
  positions: aaveV3OffchainAdapter,
  // stats: aaveV3SubgraphAdapter, // TODO: Implement subgraph adapter for stats
})
