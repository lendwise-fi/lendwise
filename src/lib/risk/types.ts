export type ChainFamily = 'evm' | 'stellar'

/**
 * A price the spot pipeline already wrote to `apy_hourly`: the asset price of a
 * product, or — for a Morpho market — its collateral price (collateral-in-loan
 * ratio × loan asset price).
 */
export interface PriceKey {
  productId: string
  leg: 'asset' | 'collateral'
}

export function priceKeyId(key: PriceKey): string {
  return `${key.leg}:${key.productId}`
}

/** One reserve of an isolated risk account. Amounts are whole tokens. */
export interface RiskReserve {
  priceKey: PriceKey
  symbol: string
  collateral: number
  liability: number
  /** Liquidation-side weight in [0, 1]: Blend c_factor, Aave liquidation threshold, Morpho lltv. */
  collateralWeight: number | null
  /** In (0, 1]: Blend l_factor as stored on chain, 1 on EVM protocols. */
  liabilityWeight: number | null
}

/** A pool or market a user borrows against — liquidated on its own. */
export interface RiskAccount {
  id: string
  protocol: string
  chainFamily: ChainFamily
  chainId: number
  poolId: string
  user: string
  reserves: RiskReserve[]
}

export function riskAccountId(p: {
  protocol: string
  chainId: number
  poolId: string
  user: string
}): string {
  return `${p.protocol}:${p.chainId}:${p.poolId}:${p.user}`
}

/** priceKeyId → USD price. An absent key means "no known price". */
export type PriceMap = ReadonlyMap<string, number>

export type UnknownReason =
  'missing-price' | 'invalid-weight' | 'invalid-amount' | 'missing-risk-data'

export type HealthFactorResult = {
  /** Origin of a protocol-reported estimate, when not calculated locally. */
  sourceLabel?: string
  /** ISO timestamp of the underlying observation, when known. */
  observedAt?: string
} & (
  | {
      status: 'ok'
      healthFactor: number
      weightedCollateralUsd?: number | null
      weightedLiabilityUsd?: number | null
    }
  | { status: 'no-liability' }
  | { status: 'unknown'; reason: UnknownReason; symbols: string[] }
)

export interface RiskAccountResult {
  id: string
  protocol: string
  poolId: string
  user: string
  result: HealthFactorResult
}
