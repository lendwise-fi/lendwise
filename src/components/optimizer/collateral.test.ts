import { describe, expect, it } from 'vitest'

import type { BorrowProduct } from '@/types'

import { optimizerCollateralSymbol } from './collateral'

const market = {
  collaterals: [{ symbol: 'XLM' }, { symbol: 'USDC' }],
  xoxno: {
    spokes: [
      {
        spokeId: 2,
        collaterals: [
          { hubId: 1, asset: 'xlm', symbol: 'XLM' },
          { hubId: 3, asset: 'usdc', symbol: 'USDC' },
        ],
      },
    ],
  },
  xoxnoSelection: { spokeId: 2, collateralHubId: 3, collateralAsset: 'usdc' },
} as unknown as BorrowProduct

describe('optimizer collateral denomination', () => {
  it('uses the exact selected variant before the first collateral and global symbol filter', () => {
    expect(optimizerCollateralSymbol([market], 'XLM')).toBe('USDC')
    expect(
      optimizerCollateralSymbol([{ ...market, xoxnoSelection: undefined }])
    ).toBe('?')
  })
  it('resolves a XOXNO selection even when a generic row comes first', () => {
    expect(
      optimizerCollateralSymbol(
        [{ ...market, xoxno: undefined }, market],
        'XLM'
      )
    ).toBe('USDC')
  })
  it('retains the generic symbol filter behavior', () => {
    expect(
      optimizerCollateralSymbol([{ ...market, xoxno: undefined }], 'OTHER')
    ).toBe('OTHER')
  })
})
