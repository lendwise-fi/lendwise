/**
 * The last observation of a slot, as written into the `last_*` columns.
 *
 * `apy_hourly` averages all its numeric columns over the running hour, which
 * is the right answer for a rate and the wrong one for an amount: a market
 * that receives $10M at 14:05 would show at 14:20 the mean of three
 * observations. The `last_*` columns therefore carry the LAST value seen, not
 * the mean — never for the APY rates.
 *
 * Pure, no DB import: this is also the definition shared between the insert
 * tuple and what the display read expects, so the two cannot diverge.
 */
import type { BorrowMarketState, SpotPayload, SupplyMarketState } from './types'

export interface LastObservation {
  availableLiquidity: number | null
  availableLiquidityUsd: number | null
  supplyAssets: number | null
  supplyAssetsUsd: number | null
  borrowAssets: number | null
  borrowAssetsUsd: number | null
  collateralAssetsUsd: number | null
  utilizationRate: number | null
  assetPriceUsd: number | null
}

/** Resolve compatibility only at ingestion; explicit unknown cash stays unknown. */
export function resolveAvailableLiquidity(m: Partial<SupplyMarketState>): {
  availableLiquidity: number | null
  availableLiquidityUsd: number | null
} {
  const derive = (supply: number | null | undefined): number | null => {
    if (supply == null || !Number.isFinite(supply)) return null
    const u = Math.min(Math.max(m.utilizationRate ?? 0, 0), 1)
    return Number.isFinite(u) ? supply - supply * u : null
  }
  return {
    availableLiquidity:
      m.availableLiquidity === undefined
        ? derive(m.supplyAssets)
        : m.availableLiquidity,
    availableLiquidityUsd:
      m.availableLiquidityUsd === undefined
        ? derive(m.supplyAssetsUsd)
        : m.availableLiquidityUsd,
  }
}

/**
 * A supply product has no borrow side: its borrow columns stay null, exactly
 * as in the averaged tuple. A supply product's liquidity is derived from its
 * utilization rate, not from an absent `borrow_assets`.
 */
export function lastObservation(p: SpotPayload): LastObservation {
  const isSupply = p.kind === 'supply'
  const sm = p.market as SupplyMarketState
  const bm = p.market as BorrowMarketState
  return {
    ...resolveAvailableLiquidity(p.market),
    supplyAssets: (isSupply ? sm.supplyAssets : bm.supplyAssets) ?? null,
    supplyAssetsUsd:
      (isSupply ? sm.supplyAssetsUsd : bm.supplyAssetsUsd) ?? null,
    borrowAssets: isSupply ? null : (bm.borrowAssets ?? null),
    borrowAssetsUsd: isSupply ? null : (bm.borrowAssetsUsd ?? null),
    collateralAssetsUsd: isSupply ? null : (bm.collateralAssetsUsd ?? null),
    utilizationRate: p.market.utilizationRate ?? null,
    assetPriceUsd: p.market.assetPriceUsd ?? null,
  }
}
