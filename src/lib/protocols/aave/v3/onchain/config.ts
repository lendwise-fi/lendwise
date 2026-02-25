import { AAVE_CONFIG } from '../../config'

/**
 * Helper to access Aave v3 chain configurations.
 * This is a re-export from the centralized config for convenience.
 */
export const AAVE_V3_CHAINS = AAVE_CONFIG.aave_v3.chains

/**
 * Type for supported Aave v3 chain IDs.
 */
export type AaveV3ChainId = keyof typeof AAVE_V3_CHAINS
