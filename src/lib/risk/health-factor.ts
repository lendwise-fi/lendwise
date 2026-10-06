export type ReservePriceMap =
  | Record<string, number | null | undefined>
  | Map<string, number | null | undefined>

export interface RiskReservePosition {
  reserveId: string
  symbol?: string
  collateralAmount?: number | null
  liabilityAmount?: number | null
  collateralWeight?: number | null
  liabilityWeight?: number | null
}

export type HealthFactorResult =
  | {
      status: 'ok'
      healthFactor: number
      weightedCollateralUsd: number
      weightedLiabilityUsd: number
      missingReserveIds: []
    }
  | {
      status: 'no-liability'
      healthFactor: number
      weightedCollateralUsd: number
      weightedLiabilityUsd: 0
      missingReserveIds: []
    }
  | {
      status: 'unknown'
      reason: 'missing-price' | 'invalid-weight' | 'invalid-amount'
      healthFactor: null
      weightedCollateralUsd: null
      weightedLiabilityUsd: null
      missingReserveIds: string[]
    }

function priceFor(prices: ReservePriceMap, reserveId: string) {
  return prices instanceof Map ? prices.get(reserveId) : prices[reserveId]
}

function isFiniteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0
}

function hasExposure(position: RiskReservePosition) {
  return (
    (position.collateralAmount != null && position.collateralAmount > 0) ||
    (position.liabilityAmount != null && position.liabilityAmount > 0)
  )
}

export function calculateHealthFactor(
  positions: RiskReservePosition[],
  prices: ReservePriceMap
): HealthFactorResult {
  const missingReserveIds = new Set<string>()

  for (const position of positions) {
    if (!hasExposure(position)) continue

    const price = priceFor(prices, position.reserveId)
    if (price == null || !Number.isFinite(price) || price <= 0) {
      missingReserveIds.add(position.reserveId)
    }
  }

  if (missingReserveIds.size > 0) {
    return {
      status: 'unknown',
      reason: 'missing-price',
      healthFactor: null,
      weightedCollateralUsd: null,
      weightedLiabilityUsd: null,
      missingReserveIds: [...missingReserveIds],
    }
  }

  let weightedCollateralUsd = 0
  let weightedLiabilityUsd = 0

  for (const position of positions) {
    const collateralAmount = position.collateralAmount ?? 0
    const liabilityAmount = position.liabilityAmount ?? 0

    if (
      !isFiniteNonNegative(collateralAmount) ||
      !isFiniteNonNegative(liabilityAmount)
    ) {
      return {
        status: 'unknown',
        reason: 'invalid-amount',
        healthFactor: null,
        weightedCollateralUsd: null,
        weightedLiabilityUsd: null,
        missingReserveIds: [],
      }
    }

    const price = priceFor(prices, position.reserveId) ?? 0

    if (collateralAmount > 0) {
      const collateralWeight = position.collateralWeight
      if (collateralWeight == null || !isFiniteNonNegative(collateralWeight)) {
        return {
          status: 'unknown',
          reason: 'invalid-weight',
          healthFactor: null,
          weightedCollateralUsd: null,
          weightedLiabilityUsd: null,
          missingReserveIds: [],
        }
      }
      weightedCollateralUsd += collateralAmount * price * collateralWeight
    }

    if (liabilityAmount > 0) {
      const liabilityWeight = position.liabilityWeight
      if (
        liabilityWeight == null ||
        !Number.isFinite(liabilityWeight) ||
        liabilityWeight <= 0
      ) {
        return {
          status: 'unknown',
          reason: 'invalid-weight',
          healthFactor: null,
          weightedCollateralUsd: null,
          weightedLiabilityUsd: null,
          missingReserveIds: [],
        }
      }
      weightedLiabilityUsd += (liabilityAmount * price) / liabilityWeight
    }
  }

  if (weightedLiabilityUsd === 0) {
    return {
      status: 'no-liability',
      healthFactor: Infinity,
      weightedCollateralUsd,
      weightedLiabilityUsd: 0,
      missingReserveIds: [],
    }
  }

  return {
    status: 'ok',
    healthFactor: weightedCollateralUsd / weightedLiabilityUsd,
    weightedCollateralUsd,
    weightedLiabilityUsd,
    missingReserveIds: [],
  }
}
