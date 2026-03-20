import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'

import type { Kind } from '@/lib/db/types'

// ─── Pool ID builder ──────────────────────────────────────────────────────────
export function buildProductId(
  marketId: string,
  chain: { id: number; name: string },
  kind: Kind
): string {
  // market prefix prevents collision — same token can exist on multiple Compound markets
  // on the same chain (e.g. different versions or deployments)
  return `compoundcomet:v3:${chain.name}:market:${marketId}:${kind}`
}

// ============================================================================
// Chain Name Mapping
// ============================================================================

/**
 * Maps Compound subgraph Network enum values to human-readable chain names.
 * Add entries as new chains are supported.
 */
export const CHAIN_NAME_MAPPING: Record<
  string,
  { protocolName: string; marketSlug: string }
> = {
  [mainnet.id]: {
    protocolName: 'ethereum',
    marketSlug: 'mainnet',
  },
  [arbitrum.id]: {
    protocolName: 'arbitrum',
    marketSlug: 'arb',
  },
  [polygon.id]: {
    protocolName: 'polygon',
    marketSlug: 'polygon',
  },
  [base.id]: {
    protocolName: 'base',
    marketSlug: 'base',
  },
  [optimism.id]: {
    protocolName: 'optimism',
    marketSlug: 'op',
  },
}

export const BASE_INDEX_SCALE = 1e15 // Compound V3 constant
