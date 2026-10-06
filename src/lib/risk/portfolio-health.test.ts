import { describe, expect, it } from 'vitest'

import type { BorrowPosition } from '@/types'

import { healthFactorFromBorrowPositions } from './portfolio-health'

function borrowPosition(
  overrides: Partial<BorrowPosition> = {}
): BorrowPosition {
  return {
    id: 'borrow-1',
    protocol: 'aave_v3',
    network: 'Base',
    healthFactor: 1.5,
    userAddress: '0x0000000000000000000000000000000000000001',
    poolId: 'pool',
    poolName: 'Pool',
    poolAddress: '0x0000000000000000000000000000000000000002',
    poolChainId: 8453,
    loanAssetAddress: '0x0000000000000000000000000000000000000003',
    loanAssetName: 'USD Coin',
    loanAssetSymbol: 'USDC',
    loanAssetDecimals: 6,
    loanAssetAmount: 1_000,
    loanAssetAmountUsd: 1_000,
    loanLiveAssetAmountUsd: 1_000,
    loanTimestamp: 1,
    collaterals: [
      {
        address: '0x0000000000000000000000000000000000000004',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        lltv: 0.8,
        amount: 1,
        amountUsd: 2_000,
      },
    ],
    apy: 0.05,
    ...overrides,
  }
}

describe('healthFactorFromBorrowPositions', () => {
  it('derives a portfolio health factor from borrowed USD and collateral weights', () => {
    const result = healthFactorFromBorrowPositions([borrowPosition()])

    expect(result.status).toBe('ok')
    expect(result.healthFactor).toBeCloseTo(1.6)
  })

  it('returns unknown when a raw reserve price is present but missing', () => {
    const position = borrowPosition({
      loanAssetPriceUsd: 1,
      collaterals: [
        {
          address: '0x0000000000000000000000000000000000000004',
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18,
          lltv: 0.8,
          amount: 1,
          priceUsd: null,
          amountUsd: 0,
        },
      ],
    })

    const result = healthFactorFromBorrowPositions([position])

    expect(result).toMatchObject({
      status: 'unknown',
      reason: 'missing-price',
    })
  })

  it('returns unknown when a collateral has no risk weight', () => {
    const position = borrowPosition({
      collaterals: [
        {
          address: '0x0000000000000000000000000000000000000004',
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18,
          amount: 1,
          amountUsd: 2_000,
        },
      ],
    })

    const result = healthFactorFromBorrowPositions([position])

    expect(result).toMatchObject({
      status: 'unknown',
      reason: 'invalid-weight',
    })
  })
})
