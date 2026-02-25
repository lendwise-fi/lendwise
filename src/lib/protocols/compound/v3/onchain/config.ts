import { COMPOUND_CONFIG } from '../../config'

/**
 * Helper to access Compound V3 chain configurations.
 * This is a re-export from the centralized config for convenience.
 */
export const COMPOUND_V3_CHAINS = COMPOUND_CONFIG.compound_v3.chains

/**
 * Type for supported Compound V3 chain IDs.
 */
export type CompoundV3ChainId = keyof typeof COMPOUND_V3_CHAINS
