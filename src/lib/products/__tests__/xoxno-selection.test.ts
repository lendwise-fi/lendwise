import { describe, expect, it } from 'vitest'

import { computeRateStats } from '@/lib/product-stats'
import { bridgeActionFor } from '@/lib/products/bridge-entry'
import {
  hasXoxnoSelection,
  selectXoxnoProduct,
} from '@/lib/products/xoxno-selection'
import type { XoxnoCollateral, XoxnoMeta } from '@/lib/protocols/xoxno/v1/types'
import type { BorrowProduct, SupplyProduct } from '@/types'

const collateral: XoxnoCollateral = {
  hubId: 1,
  asset: 'token-a',
  name: 'Token A',
  symbol: 'SAME',
  decimals: 7,
  logoUrl: null,
  ltv: 0.8,
  lltv: 0.85,
  canBeCollateral: true,
  canSupply: true,
  supplyCapacity: null,
  paused: false,
  frozen: false,
  noSeize: false,
}
const meta: XoxnoMeta = {
  network: 'mainnet',
  controller: 'controller',
  pool: 'pool',
  nft: 'nft',
  hubId: 1,
  asset: 'usdc',
  hubName: 'Core',
  historySpokeId: 1,
  logoUrl: null,
  spokes: [1, 2].map((spokeId) => ({
    spokeId,
    spokeName: `Spoke ${spokeId}`,
    canSupply: true,
    canBorrow: true,
    canBeCollateral: true,
    canOpenAccount: true,
    supplyCapacity: null,
    borrowCapacity: null,
    ltv: 0.8,
    lltv: 0.85,
    paused: false,
    frozen: false,
    noSeize: false,
    collaterals: [
      { ...collateral, ltv: spokeId === 1 ? 0.8 : 0.4 },
      { ...collateral, hubId: 2, asset: 'token-b', ltv: 0.3 },
    ],
  })),
}
const product = {
  protocol: 'xoxno_v1',
  xoxno: meta,
  collaterals: [],
  poolChainId: -1,
  assetSymbol: 'USDC',
  productId: 'canonical-xoxno-usdc',
} as unknown as BorrowProduct

describe('XOXNO market selection', () => {
  it.each([{ canOpenAccount: false }, { paused: true }, { frozen: true }])(
    'rejects unavailable account rules: %j',
    (flags) => {
      const xoxno = {
        ...meta,
        spokes: meta.spokes.map((s) => ({ ...s, ...flags })),
      }
      expect(
        hasXoxnoSelection(
          selectXoxnoProduct({ xoxno } as SupplyProduct, { spokeId: 1 })
        )
      ).toBe(false)
      expect(
        hasXoxnoSelection(
          selectXoxnoProduct(
            { ...product, xoxno },
            {
              spokeId: 1,
              collateralHubId: 1,
              collateralAsset: 'token-a',
            }
          )
        )
      ).toBe(false)
    }
  )

  it('requires the requested action to be permitted', () => {
    const xoxno = {
      ...meta,
      spokes: meta.spokes.map((s) => ({
        ...s,
        canSupply: false,
        canBorrow: false,
      })),
    }
    expect(
      hasXoxnoSelection(
        selectXoxnoProduct({ xoxno } as SupplyProduct, { spokeId: 1 })
      )
    ).toBe(false)
    expect(
      hasXoxnoSelection(
        selectXoxnoProduct(
          { ...product, xoxno },
          {
            spokeId: 1,
            collateralHubId: 1,
            collateralAsset: 'token-a',
          }
        )
      )
    ).toBe(false)
    expect(
      hasXoxnoSelection(
        selectXoxnoProduct({ xoxno: meta } as SupplyProduct, { spokeId: 1 })
      )
    ).toBe(true)
  })

  it.each([
    { canSupply: false },
    { canBeCollateral: false },
    { paused: true },
    { frozen: true },
  ])('rejects unusable exact collateral: %j', (flags) => {
    const xoxno = {
      ...meta,
      spokes: meta.spokes.map((s) => ({
        ...s,
        collaterals: s.collaterals.map((c) => ({ ...c, ...flags })),
      })),
    }
    expect(
      hasXoxnoSelection(
        selectXoxnoProduct(
          { ...product, xoxno },
          {
            spokeId: 1,
            collateralHubId: 1,
            collateralAsset: 'token-a',
          }
        )
      )
    ).toBe(false)
  })

  it('requires a spoke and exact hub/token collateral despite duplicate symbols', () => {
    expect(hasXoxnoSelection(selectXoxnoProduct(product))).toBe(false)
    expect(hasXoxnoSelection(selectXoxnoProduct(product, { spokeId: 1 }))).toBe(
      false
    )
    expect(
      hasXoxnoSelection(
        selectXoxnoProduct(product, {
          spokeId: 1,
          collateralHubId: 2,
          collateralAsset: 'token-a',
        })
      )
    ).toBe(false)
    expect(
      hasXoxnoSelection(
        selectXoxnoProduct(product, {
          spokeId: 1,
          collateralHubId: 2,
          collateralAsset: 'token-b',
        })
      )
    ).toBe(true)
  })

  it('projects only selected-spoke risk and clears a removed spoke', () => {
    const selected = selectXoxnoProduct(product, {
      spokeId: 2,
      collateralHubId: 1,
      collateralAsset: 'token-a',
    })
    expect(selected.collaterals[0].ltv).toBe(0.4)
    expect(selectXoxnoProduct(product).collaterals).toEqual([])
    expect(
      selectXoxnoProduct(product, { spokeId: 99 }).xoxnoSelection
    ).toBeUndefined()
  })

  it('carries canonical XOXNO product identity into the USDC bridge next step', () => {
    expect(
      new URL(
        bridgeActionFor(product)!,
        'https://lendwise.fi'
      ).searchParams.get('product')
    ).toBe(product.productId)
  })

  it('keeps reported utilization separate from cash and labels unpriced totals', () => {
    const priced = {
      ...product,
      assetAmountUsd: 1_000,
      liquidityAmountUsd: 750,
      utilizationRate: 0.9,
    }
    expect(computeRateStats([priced], 'intraday').utilizationPct).toBe(90)
    const partial = computeRateStats(
      [priced, { ...priced, assetAmountUsd: null, liquidityAmountUsd: null }],
      'intraday'
    )
    expect(partial.totalDepositsUsd).toBe(1_000)
    expect(partial.unpricedDeposits).toBe(1)
    expect(partial.unpricedLiquidity).toBe(1)
    expect(partial.utilizationPct).toBeNull()
  })
})
