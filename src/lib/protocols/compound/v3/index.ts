import { createVersionAdapter } from '../../utils'
import { compoundV3OnchainAdapter } from './onchain'

/**
 * Compound V3 Adapter
 * - Positions: Subgraph (no official GraphQL API available)
 * - Stats: Subgraph (same source for historical data)
 */
export const compoundV3Adapter = createVersionAdapter('v3', {
  positions: compoundV3OnchainAdapter,
  rates: compoundV3OnchainAdapter,
})
