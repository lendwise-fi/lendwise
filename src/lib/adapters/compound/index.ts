import { createProtocolAdapter } from '../utils'
import { COMPOUND_CONFIG } from './config'
import { compoundV3Adapter } from './v3'

// ============================================================================
// Compound Protocol Adapter
// ============================================================================

/**
 * Main Compound Protocol Adapter with version support.
 * Currently supports:
 * - compound_v3: Uses Subgraph (default) - Implementation pending
 *
 * Note: Compound does not provide a centralized GraphQL API.
 * Data is fetched from community-maintained subgraphs.
 *
 * @example
 * ```typescript
 * // Use default version (compound_v3)
 * const positions = await CompoundAdapter.getUserLendPositions(['0x...'])
 *
 * // Explicitly use compound_v3
 * const v3Positions = await CompoundAdapter.getUserLendPositions(['0x...'], 'compound_v3')
 * ```
 */
export const CompoundAdapter = createProtocolAdapter(
  COMPOUND_CONFIG,
  {
    compound_v3: compoundV3Adapter,
  },
  'compound_v3' // default version
)

// ============================================================================
// Re-exports
// ============================================================================
export { COMPOUND_CONFIG } from './config'
