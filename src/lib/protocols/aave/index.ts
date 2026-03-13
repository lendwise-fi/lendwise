import { createProtocolAdapter } from '../utils'
import { AAVE_CONFIG } from './config'
import { aaveV3Adapter } from './v3'

// ============================================================================
// AAVE Protocol Adapter
// ============================================================================

/**
 * Main AAVE Protocol Adapter with version support.
 * Currently supports:
 * - aave_v3: Uses GraphQL API (default)
 *
 * @example
 * ```typescript
 * // Use default version (aave_v3)
 * const positions = await AaveAdapter.getUserLendPositions({ addresses: ['0x...'] })
 *
 * // Explicitly use aave_v3
 * const v3Positions = await AaveAdapter.getUserLendPositions({ addresses: ['0x...'] }, 'aave_v3')
 * ```
 */
export const AaveAdapter = createProtocolAdapter(
  AAVE_CONFIG,
  {
    aave_v3: aaveV3Adapter,
  },
  'aave_v3' // default version
)

// ============================================================================
// Re-exports
// ============================================================================
export { AAVE_CONFIG } from './config'
export { fetchAaveV3Apy } from './v3/apy-spot'
export { syncAaveHistory } from './v3/apy-history'
export { fetchAaveV3Pools } from './v3/pools'
