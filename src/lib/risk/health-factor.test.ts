import { describe, expect, it } from 'vitest'

import { calculateHealthFactor } from './health-factor'

describe('calculateHealthFactor', () => {
  it('calculates health factor across multiple reserves', () => {
    const result = calculateHealthFactor(
      [
        {
          reserveId: 'USDC',
          collateralAmount: 1_000,
          collateralWeight: 0.85,
        },
        {
          reserveId: 'ETH',
          collateralAmount: 1,
          collateralWeight: 0.8,
          liabilityAmount: 0.1,
          liabilityWeight: 1,
        },
      ],
      { USDC: 1, ETH: 2_000 }
    )

    expect(result.status).toBe('ok')
    expect(result.healthFactor).toBeCloseTo((850 + 1_600) / 200)
  })

  it('returns no-liability when collateral exists without debt', () => {
    const result = calculateHealthFactor(
      [{ reserveId: 'XLM', collateralAmount: 10_000, collateralWeight: 0.5 }],
      { XLM: 0.1 }
    )

    expect(result.status).toBe('no-liability')
    expect(result.healthFactor).toBe(Infinity)
    expect(result.weightedCollateralUsd).toBe(500)
  })

  it('fails closed when an exposed reserve has no price', () => {
    const result = calculateHealthFactor(
      [
        { reserveId: 'USDC', collateralAmount: 1_000, collateralWeight: 0.85 },
        { reserveId: 'EURC', liabilityAmount: 100, liabilityWeight: 1 },
      ],
      { USDC: 1 }
    )

    expect(result).toMatchObject({
      status: 'unknown',
      reason: 'missing-price',
      missingReserveIds: ['EURC'],
    })
  })

  it('matches an Aave-style liquidation-threshold scenario', () => {
    const result = calculateHealthFactor(
      [
        {
          reserveId: 'WETH',
          collateralAmount: 2,
          collateralWeight: 0.825,
        },
        {
          reserveId: 'USDC',
          liabilityAmount: 2_000,
          liabilityWeight: 1,
        },
      ],
      { WETH: 2_000, USDC: 1 }
    )

    expect(result.status).toBe('ok')
    expect(result.healthFactor).toBeCloseTo(1.65)
  })

  it('returns unknown for invalid liability weights', () => {
    const result = calculateHealthFactor(
      [{ reserveId: 'USDC', liabilityAmount: 100, liabilityWeight: 0 }],
      { USDC: 1 }
    )

    expect(result).toMatchObject({
      status: 'unknown',
      reason: 'invalid-weight',
    })
  })
})
