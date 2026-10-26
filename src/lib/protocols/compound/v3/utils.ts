import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'

import type { ApyBreakdown, Kind } from '@/lib/db/types'
import {
  CHAIN_SLUG_MAP,
  type RegisteredChainId,
} from '@/lib/protocols/core/toolkit'
import { aprToApyPerSecond } from '@/lib/utils'

// ─── Pool ID builder ──────────────────────────────────────────────────────────
export function buildProductId(
  marketId: string,
  chain: { id: number; name: string },
  kind: Kind
): string {
  // market prefix prevents collision — same token can exist on multiple Compound markets
  // on the same chain (e.g. different versions or deployments)
  const network = CHAIN_SLUG_MAP[chain.id as RegisteredChainId]
  if (!network)
    throw new Error(
      `No slug registered for chainId ${chain.id} — add it to chain-slugs.ts`
    )
  return `compoundcomet:v3:${network}:market:${marketId}:${kind}`
}

// ─── Rates ────────────────────────────────────────────────────────────────────

/**
 * The subgraph's `supplyApr`/`borrowApr` are Comet's per-second rate times
 * seconds per year, i.e. an APR. Rates are stored as APY, and Comet accrues
 * interest every second, so the base rate is compounded per second. Reward
 * APRs stay linear: COMP is a separate asset, not compounded into the
 * position (the same rule as Morpho's rewards). Spot and history both read
 * rates through here so their rows agree.
 */
export function cometApy(
  accounting: {
    supplyApr: unknown
    rewardSupplyApr: unknown
    borrowApr: unknown
    rewardBorrowApr: unknown
  },
  kind: Kind
): ApyBreakdown {
  const base = aprToApyPerSecond(
    Number(kind === 'supply' ? accounting.supplyApr : accounting.borrowApr)
  )
  const rewards = Number(
    kind === 'supply' ? accounting.rewardSupplyApr : accounting.rewardBorrowApr
  )
  return {
    base,
    rewards,
    fees: 0,
    net: kind === 'supply' ? base + rewards : base - rewards,
    rewardItems: [],
  }
}

// ============================================================================
// Chain Name Mapping
// ============================================================================

/**
 * Maps Compound subgraph Network enum values to human-readable chain names.
 * Add entries as new chains are supported.
 */
export const SLUG_MAPPING: Record<number, string> = {
  [mainnet.id]: 'mainnet',
  [arbitrum.id]: 'arb',
  [polygon.id]: 'polygon',
  [base.id]: 'base',
  [optimism.id]: 'op',
}

export const BASE_INDEX_SCALE = 1e15 // Compound V3 constant
