import { describe, expect, it } from 'vitest'

import { RAY, WAD, usdToNative } from './capacity'
import type { RpcSnapshot, VerifiedMarket } from './rpc'
import {
  assertFresh,
  checkBorrowAllocations,
  checkSupplyAllocations,
  openingLtv,
  supplyPreflight,
} from './verification'

const unit = 10n ** 7n
const verified = (): VerifiedMarket => ({
  productId: 'debt',
  spokeId: 1,
  debt: {
    key: '1:1:debt',
    hubId: 1,
    asset: 'debt',
    market: {
      decimals: 7,
      cash: 400n * unit,
      supplied: 1000n * RAY,
      borrowed: 600n * RAY,
      storedSupplyIndex: RAY,
      storedBorrowIndex: RAY,
      supplyIndex: RAY,
      borrowIndex: RAY,
      maxUtilization: RAY,
      price: WAD,
    },
    listing: {
      supplied: 1000n * RAY,
      borrowed: 600n * RAY,
      supplyCap: 2000n * unit,
      borrowCap: 2000n * unit,
      ltv: 7500,
      threshold: 8000,
      collateral: true,
      borrowable: true,
      paused: false,
      frozen: false,
    },
  },
  collateral: {
    key: '1:2:collateral',
    hubId: 2,
    asset: 'collateral',
    market: {
      decimals: 7,
      cash: 1000n * unit,
      supplied: 1000n * RAY,
      borrowed: 0n,
      storedSupplyIndex: RAY,
      storedBorrowIndex: RAY,
      supplyIndex: RAY,
      borrowIndex: RAY,
      maxUtilization: RAY,
      price: WAD,
    },
    listing: {
      supplied: 1000n * RAY,
      borrowed: 0n,
      supplyCap: 2000n * unit,
      borrowCap: 2000n * unit,
      ltv: 7500,
      threshold: 8000,
      collateral: true,
      borrowable: true,
      paused: false,
      frozen: false,
    },
  },
})
const snapshot = (market = verified()): RpcSnapshot => ({
  startedAt: Date.now(),
  observedAt: new Date().toISOString(),
  minLedger: 100,
  maxLedger: 101,
  minCollateralUsd: WAD,
  markets: [market],
})
const response = (
  allocations = [{ market_index: 0, borrow: 70, collateral: 100 }]
) => ({
  success: true,
  allocations,
  total_borrow: 9999,
  total_collateral: 9999,
  optimal_rate: 0.05,
  optimal_rate_percent: 5,
})

describe('RPC-qualified existing solver', () => {
  it('caps requested LTV to both contract opening risk factors', () => {
    const m = verified()
    expect(openingLtv(m, 0.9)).toBe(0.75)
    m.collateral!.listing.threshold = 7000
    expect(openingLtv(m, 0.9)).toBe(0.7)
    m.collateral!.market.decimals = 2
    expect(() => openingLtv(m, 0.7)).toThrow('supported collateral')
  })
  it('requires supply to accept the entire capital before the unconstrained solver', () => {
    const m = verified()
    m.debt.listing.supplyCap = 1050n * unit
    expect(() => supplyPreflight(m, '100')).toThrow('cap')
  })
  it('rejects invalid response indices, duplicate allocations and missing capital', () => {
    const s = snapshot()
    for (const allocations of [
      [{ vault_index: 1, allocation: 1, allocation_percent: 100 }],
      [
        { vault_index: 0, allocation: 0.5, allocation_percent: 50 },
        { vault_index: 0, allocation: 0.5, allocation_percent: 50 },
      ],
      [{ vault_index: 0, allocation: 0.5, allocation_percent: 50 }],
    ])
      expect(() =>
        checkSupplyAllocations(
          { success: true, allocations, resulting_diversification: 0 },
          s,
          new Map([[0, s.markets[0]]]),
          '100',
          1
        )
      ).toThrow()
  })
  it('rejects a split below native precision and any exact supply overspend', () => {
    const s = snapshot()
    const allocations = [
      { vault_index: 0, allocation: 0.5, allocation_percent: 50 },
      { vault_index: 1, allocation: 0.5, allocation_percent: 50 },
    ]
    expect(() =>
      checkSupplyAllocations(
        { success: true, allocations, resulting_diversification: 50 },
        s,
        new Map([
          [0, s.markets[0]],
          [1, s.markets[0]],
        ]),
        '0.0000001',
        2
      )
    ).toThrow('zero native')
    const overspend = [
      { vault_index: 0, allocation: 0.5000004, allocation_percent: 50.00004 },
      { vault_index: 1, allocation: 0.5, allocation_percent: 50 },
    ]
    expect(() =>
      checkSupplyAllocations(
        {
          success: true,
          allocations: overspend,
          resulting_diversification: 50,
        },
        s,
        new Map([
          [0, s.markets[0]],
          [1, s.markets[0]],
        ]),
        '100',
        2
      )
    ).toThrow('exact capital budget')
  })
  it('accepts safe rounded allocations and recomputes untrusted solver totals', () => {
    const s = snapshot()
    const result = response()
    checkBorrowAllocations(
      result,
      s,
      new Map([[0, s.markets[0]]]),
      [0.75],
      1,
      100,
      'collateral_target',
      '100'
    )
    expect(result.total_borrow).toBe(70)
    expect(result.total_collateral).toBe(100)
  })
  it('rejects min collateral, LTV, exact collateral budget and shared cash violations', () => {
    let s = snapshot()
    s.minCollateralUsd = 100n * WAD
    expect(() =>
      checkBorrowAllocations(
        response(),
        s,
        new Map([[0, s.markets[0]]]),
        [0.75],
        1,
        100,
        'collateral_target',
        '100'
      )
    ).toThrow('minimum')
    s = snapshot()
    expect(() =>
      checkBorrowAllocations(
        response([{ market_index: 0, borrow: 76, collateral: 100 }]),
        s,
        new Map([[0, s.markets[0]]]),
        [0.75],
        1,
        100,
        'collateral_target',
        '100'
      )
    ).toThrow('LTV')
    expect(() =>
      checkBorrowAllocations(
        response([{ market_index: 0, borrow: 70, collateral: 100.0000001 }]),
        s,
        new Map([[0, s.markets[0]]]),
        [0.75],
        1,
        100,
        'collateral_target',
        '100'
      )
    ).toThrow('exact collateral budget')
    expect(() =>
      checkBorrowAllocations(
        response([
          { market_index: 0, borrow: 200, collateral: 300 },
          { market_index: 1, borrow: 200, collateral: 300 },
        ]),
        s,
        new Map([
          [0, s.markets[0]],
          [1, s.markets[0]],
        ]),
        [0.75, 0.75],
        2,
        600,
        'collateral_target',
        '600'
      )
    ).toThrow('shared hub liquidity')
  })
  it('rejects an expired or excessively dispersed snapshot', () => {
    const s = snapshot()
    expect(() => assertFresh(s, s.startedAt + 30000)).toThrow('expired')
    expect(() => assertFresh({ ...s, maxLedger: 107 })).toThrow('expired')
  })
  it('does not amplify rounding for cheap assets', () => {
    expect(
      usdToNative(
        0.00000010001,
        { ...verified().debt.market, price: 10n ** 10n },
        'ceil'
      )
    ).toBe(100010000n)
  })
})
