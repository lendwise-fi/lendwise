import { createVersionAdapter } from '../../utils'
import { morphoV1OffchainAdapter } from './offchain'

// import { morphoV1OnchainAdapter } from './onchain'

/**
 * Morpho V1 Adapter
 * - Positions: GraphQL API (real-time user positions)
 * - Stats: Subgraph (historical/statistical data) - To be implemented
 */
export const morphoV1Adapter = createVersionAdapter('v1', {
  positions: morphoV1OffchainAdapter,
  rates: morphoV1OffchainAdapter,
})
