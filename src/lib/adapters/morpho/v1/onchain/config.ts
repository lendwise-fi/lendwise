import { MORPHO_CONFIG } from '../../config'

/**
 * Helper to access Morpho v1 chain configurations.
 * This is a re-export from the centralized config for convenience.
 */
export const MORPHO_V1_CHAINS = MORPHO_CONFIG.morpho_v1.chains

/**
 * Type for supported Morpho v1 chain IDs.
 */
export type MorphoV1ChainId = keyof typeof MORPHO_V1_CHAINS
