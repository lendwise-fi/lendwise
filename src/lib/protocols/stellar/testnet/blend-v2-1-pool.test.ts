import { describe, expect, it } from 'vitest'

import {
  type ReserveReading,
  borrowPositionsFromReadings,
  supplyPositionsFromReadings,
} from './blend-v2-1-pool'

const USER = 'GA4VFXY7QQFNU4R6JLRFSO3EWRA6CUCNNGB6V3YOF3NZDC4TPOCOUM2E'
const POOL = 'CB3447A446DY3USGWPIDXTNQHF5EX24XDQA2EN6TAZP62JTPBTNOA52Q'
const USDC = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU'
const XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

const reading = (overrides: Partial<ReserveReading>): ReserveReading => ({
  assetId: USDC,
  decimals: 7,
  apy: 0.05,
  priceUsd: 1,
  supplied: 0,
  collateral: 0,
  borrowed: 0,
  ...overrides,
})

describe('supplyPositionsFromReadings', () => {
  it('skips reserves with no supply or collateral', () => {
    const rows = supplyPositionsFromReadings({
      poolId: POOL,
      userAddress: USER,
      readings: [reading({ assetId: XLM, supplied: 0, collateral: 0 })],
    })
    expect(rows).toEqual([])
  })

  it('combines supplied and collateral amounts and prices them', () => {
    const [row] = supplyPositionsFromReadings({
      poolId: POOL,
      userAddress: USER,
      readings: [
        reading({
          assetId: XLM,
          decimals: 7,
          priceUsd: 0.12,
          supplied: 100,
          collateral: 50,
        }),
      ],
    })
    expect(row.protocol).toBe('blend_v2')
    expect(row.network).toBe('Stellar Testnet')
    expect(row.poolId).toBe(POOL)
    expect(row.assetSymbol).toBe('XLM')
    expect(row.assetAmount).toBe('150')
    expect(row.assetAmountUsd).toBeCloseTo(18)
    expect(row.assetDecimals).toBe(7)
    expect(row.apy).toBe(0.05)
  })

  it('falls back to a truncated asset id for unknown reserves', () => {
    const unknown = 'CUNKNOWN0000000000000000000000000000000000000000000000000'
    const [row] = supplyPositionsFromReadings({
      poolId: POOL,
      userAddress: USER,
      readings: [reading({ assetId: unknown, supplied: 1 })],
    })
    expect(row.assetSymbol).toBe('CUNKNO')
  })
})

describe('borrowPositionsFromReadings', () => {
  it('returns no rows when nothing is borrowed', () => {
    const rows = borrowPositionsFromReadings({
      poolId: POOL,
      userAddress: USER,
      readings: [reading({ borrowed: 0 })],
      healthFactor: 0,
    })
    expect(rows).toEqual([])
  })

  it('maps a borrowed reserve and carries the pool health factor', () => {
    const [row] = borrowPositionsFromReadings({
      poolId: POOL,
      userAddress: USER,
      readings: [reading({ assetId: USDC, borrowed: 40, priceUsd: 1 })],
      healthFactor: 1.8,
    })
    expect(row.loanAssetSymbol).toBe('USDC')
    expect(row.loanAssetAmount).toBe(40)
    expect(row.loanAssetAmountUsd).toBeCloseTo(40)
    expect(row.healthFactor).toBe(1.8)
    expect(row.protocol).toBe('blend_v2')
    expect(row.collaterals).toEqual([])
  })

  it('keeps row ids unique per user, pool and asset', () => {
    const rows = borrowPositionsFromReadings({
      poolId: POOL,
      userAddress: USER,
      readings: [
        reading({ assetId: USDC, borrowed: 1 }),
        reading({ assetId: XLM, borrowed: 1 }),
      ],
      healthFactor: 2,
    })
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })
})
