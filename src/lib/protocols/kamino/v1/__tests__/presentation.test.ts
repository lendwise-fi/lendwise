import { describe, expect, it } from 'vitest'

import type { ProductRow } from '@/lib/db/schema'

import { kaminoPoolName, kaminoProductLink } from '../presentation'

const MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
const RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'

function row(meta: unknown): ProductRow {
  return {
    assetName: 'USDC',
    protocolName: 'KaminoLend',
    protocolAddress: RESERVE,
    meta,
  } as unknown as ProductRow
}

describe('kamino presentation', () => {
  it('names the row after its market and asset', () => {
    expect(
      kaminoPoolName(row({ market: MARKET, marketName: 'Main Market' }))
    ).toBe('Main Market · USDC')
  })

  it('falls back to the asset name without a market name', () => {
    expect(kaminoPoolName(row({}))).toBe('USDC')
  })

  it('links to the reserve page with base58 case kept', () => {
    expect(kaminoProductLink(row({ market: MARKET }))).toBe(
      `https://kamino.com/borrow/reserve/${MARKET}/${RESERVE}`
    )
  })

  it('has no link without a market', () => {
    expect(kaminoProductLink(row({}))).toBe('')
  })
})
