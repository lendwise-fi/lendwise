import { describe, expect, it } from 'vitest'

import {
  I128_MAX,
  RAY,
  type RawListing,
  type RawMarket,
  WAD,
  borrowCapacity,
  capShares,
  checkSupply,
  collateralUsd,
  debtUsd,
  parseAmount,
  scaled,
} from './capacity'

// Wire units match common/src/types/pool.rs and contract guards: shares/indexes RAY, cash/caps native.
const market = (overrides: Partial<RawMarket> = {}): RawMarket => ({
  decimals: 7,
  cash: 400n * 10n ** 7n,
  supplied: 1_000n * RAY,
  borrowed: 600n * RAY,
  storedSupplyIndex: RAY,
  storedBorrowIndex: RAY,
  supplyIndex: RAY,
  borrowIndex: RAY,
  maxUtilization: (9n * RAY) / 10n,
  price: WAD,
  ...overrides,
})
const listing = (overrides: Partial<RawListing> = {}): RawListing => ({
  supplied: 1_000n * RAY,
  borrowed: 600n * RAY,
  supplyCap: 2_000n * 10n ** 7n,
  borrowCap: 2_000n * 10n ** 7n,
  ltv: 7500,
  threshold: 8000,
  collateral: true,
  borrowable: true,
  paused: false,
  frozen: false,
  ...overrides,
})

describe('contract precision and caps', () => {
  it('floors supply shares, ceils debt shares and floors cap shares', () => {
    const m = market({
      supplyIndex: (3n * RAY) / 2n,
      borrowIndex: (3n * RAY) / 2n,
    })
    expect(scaled(1n, m, 'supply')).toBe(66666666666666666666n)
    expect(scaled(1n, m, 'borrow')).toBe(66666666666666666667n)
    expect(capShares(1n, m, 'borrow')).toBe(66666666666666666666n)
  })
  it('treats zero caps as closed and rejects sub-share dust', () => {
    expect(() => checkSupply(market(), listing({ supplyCap: 0n }), 1n)).toThrow(
      'cap'
    )
    expect(borrowCapacity(market(), listing({ borrowCap: 0n }))).toBe(0n)
    expect(() =>
      checkSupply(
        market({
          decimals: 18,
          supplied: 0n,
          borrowed: 0n,
          supplyIndex: I128_MAX,
        }),
        listing(),
        1n
      )
    ).toThrow('zero shares')
  })
  it('caps the whole deposit and preserves halted listings', () => {
    expect(() =>
      checkSupply(
        market(),
        listing({ supplyCap: 1_001n * 10n ** 7n }),
        2n * 10n ** 7n
      )
    ).toThrow('cap')
    expect(() => checkSupply(market(), listing({ frozen: true }), 1n)).toThrow(
      'disabled'
    )
  })
  it('uses contract intermediate RAY-to-WAD directed valuation', () => {
    const m = market({ price: 3n * WAD })
    expect(collateralUsd(10n ** 9n - 1n, m)).toBe(0n)
    expect(debtUsd(1n, m)).toBe(3n)
  })
  it('validates decimals and the i128 asset-to-RAY domain', () => {
    expect(parseAmount('12.0000001', 7)).toBe(120000001n)
    for (const raw of ['1e3', '-1', '0', '1.00000001', 'NaN', ' 1'])
      expect(() => parseAmount(raw, 7)).toThrow()
    expect(() => scaled(I128_MAX, market(), 'borrow')).toThrow('arithmetic')
  })
})

describe('pool guards including pending revenue', () => {
  it('limits new debt using ceiled utilization and a floored supply lower bound', () => {
    expect(borrowCapacity(market(), listing())).toBe(300n * 10n ** 7n)
  })
  it('reserves from cash plus current debt rather than undercounted stored supplier shares', () => {
    // Pending accrual mints 10 RAY revenue shares; the fresh index view alone omits them.
    const m = market({
      cash: 400n * 10n ** 7n,
      supplyIndex: (105n * RAY) / 100n,
      borrowIndex: (11n * RAY) / 10n,
      maxUtilization: RAY,
    })
    expect(borrowCapacity(m, listing())).toBe(3788n * 10n ** 6n)
    expect(borrowCapacity(m, listing())).toBeLessThan(379n * 10n ** 7n)
  })
  it('reserves supply-share headroom for pending revenue near i128 max', () => {
    const supplied = I128_MAX - 2n * 10n ** 9n
    const m = market({
      decimals: 18,
      supplied,
      borrowed: 0n,
      cash: (supplied + 10n ** 9n - 1n) / 10n ** 9n,
    })
    const l = listing({
      supplied: 0n,
      borrowed: 0n,
      supplyCap: I128_MAX / 10n ** 9n,
    })
    expect(() => checkSupply(m, l, 1n)).toThrow('arithmetic limits')
  })
  it('rejects an unbacked pool on both supply and borrow entry', () => {
    const insolvent = market({ cash: 0n })
    expect(() => checkSupply(insolvent, listing(), 10n ** 7n)).toThrow('backed')
    expect(() => borrowCapacity(insolvent, listing())).toThrow('backed')
    expect(() => borrowCapacity(market({ supplied: 0n }), listing())).toThrow(
      'backed'
    )
  })
})
