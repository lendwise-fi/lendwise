import type { Address } from 'viem'

import {
  AAVE_CONFIG,
  PROTOCOL_ID as AAVE_PROTOCOL_ID,
} from '@/lib/adapters/aave'
import { COMPOUND_CONFIG } from '@/lib/adapters/compound'
import {
  MORPHO_CONFIG,
  PROTOCOL_ID as MORPHO_PROTOCOL_ID,
} from '@/lib/adapters/morpho'
import type { GraphqlProtocolAdapter } from '@/lib/adapters/types'

// ============================================================================
// PROTOCOL CONFIG INTERFACE
// ============================================================================
export interface ProtocolConfig {
  name: string
  displayName: string
  chainId: number
  contracts: {
    pool?: Address
    dataProvider?: Address
    oracle?: Address
    comptroller?: Address
    morpho?: Address
  }
  markets: { name: string; address: Address }[]
  subgraphUrl?: string
  blockExplorer: string
}

// ============================================================================
// PROTOCOL REGISTRY - SINGLE SOURCE OF TRUTH
// ============================================================================
// This registry is the ONLY place you need to modify to enable/disable protocols.
//
// HOW TO ADD A NEW PROTOCOL:
// 1. Create adapter folder in @/lib/adapters/[protocol] with config and adapter
// 2. Import the config at the top of this file
// 3. Add entry to PROTOCOL_REGISTRY below
//
// HOW TO DISABLE A PROTOCOL:
// - Simply comment out the entry in PROTOCOL_REGISTRY
//
// The ProtocolName type and all helper functions are auto-generated from this registry.
// ============================================================================

export const PROTOCOL_REGISTRY = {
  [AAVE_PROTOCOL_ID]: {
    displayName: 'Aave',
    config: AAVE_CONFIG,
    adapter: () => import('@/lib/adapters/aave').then((m) => m.AaveAdapter),
  },
  [MORPHO_PROTOCOL_ID]: {
    displayName: 'Morpho',
    config: MORPHO_CONFIG,
    adapter: () => import('@/lib/adapters/morpho').then((m) => m.MorphoAdapter),
  },
  // compound: {
  //   displayName: 'Compound',
  //   config: COMPOUND_CONFIG,
  //   adapter: () =>
  //     import('@/lib/adapters/compound').then((m) => m.CompoundAdapter),
  // },
} as const

// ============================================================================
// AUTO-GENERATED TYPES AND HELPERS
// ============================================================================
// Everything below is automatically derived from PROTOCOL_REGISTRY

// Derive ProtocolName type from registry keys (single source of truth)
export type ProtocolName = keyof typeof PROTOCOL_REGISTRY

// Export protocol name constants for use in code (no need for 'as const')
export const PROTOCOL_NAMES = {
  AAVE: AAVE_PROTOCOL_ID,
  MORPHO: MORPHO_PROTOCOL_ID,
  // COMPOUND: 'compound', // Uncomment when enabled
} as const satisfies Record<string, ProtocolName>

// Export individual configs for backward compatibility
export { AAVE_CONFIG, COMPOUND_CONFIG, MORPHO_CONFIG }

// Get list of all supported protocol names
export const SUPPORTED_PROTOCOL_NAMES = Object.keys(
  PROTOCOL_REGISTRY
) as ProtocolName[]

// Legacy interface for backward compatibility
export interface ProtocolRegistryEntry {
  name: ProtocolName
  adapter: () => Promise<GraphqlProtocolAdapter>
}

// Legacy array format for backward compatibility
export const SUPPORTED_PROTOCOLS: ProtocolRegistryEntry[] =
  SUPPORTED_PROTOCOL_NAMES.map((name) => ({
    name,
    adapter: PROTOCOL_REGISTRY[name].adapter,
  }))

// Get protocol config by name and chain
export function getProtocolConfig(
  protocol: ProtocolName,
  chainId: number
): ProtocolConfig | undefined {
  return PROTOCOL_REGISTRY[protocol]?.config[chainId]
}

// Get all supported protocols for a specific chain
export function getSupportedProtocols(chainId: number): ProtocolConfig[] {
  return SUPPORTED_PROTOCOL_NAMES.map(
    (protocol) => PROTOCOL_REGISTRY[protocol].config[chainId]
  ).filter((config): config is ProtocolConfig => config !== undefined)
}

// Get all protocol names (legacy helper)
export function getProtocolNames(): ProtocolName[] {
  return SUPPORTED_PROTOCOL_NAMES
}

// Get protocol display name
export function getProtocolDisplayName(protocol: ProtocolName): string {
  return PROTOCOL_REGISTRY[protocol]?.displayName ?? protocol
}
