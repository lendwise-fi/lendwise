import { createProtocolAdapter } from '../utils'
import { MORPHO_CONFIG } from './config'
import { morphoV1Adapter } from './v1'

// ============================================================================
// Morpho Protocol Adapter
// ============================================================================

/**
 * Main Morpho Protocol Adapter with version support.
 * Currently supports:
 * - morpho_v1: Uses GraphQL API (default)
 *
 * @example
 * ```typescript
 * // Use default version (morpho_v1)
 * const positions = await MorphoAdapter.getUserLendPositions({ addresses: ['0x...'] })
 *
 * // Explicitly use morpho_v1
 * const v1Positions = await MorphoAdapter.getUserLendPositions({ addresses: ['0x...'] }, 'morpho_v1')
 * ```
 */
export const MorphoAdapter = createProtocolAdapter(
  MORPHO_CONFIG,
  {
    morpho_v1: morphoV1Adapter,
  },
  'morpho_v1' // default version
)

// ============================================================================
// Re-exports
// ============================================================================
export { MORPHO_CONFIG } from './config'
export { fetchMorphoV1Apy } from './v1/apy-spot'
