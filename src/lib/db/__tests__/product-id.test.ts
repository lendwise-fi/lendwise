import { describe, expect, it } from 'vitest'

import { decomposeProductId } from '@/lib/db/product-id'

describe('decomposeProductId', () => {
  it('parses aave with kind suffix', () => {
    expect(decomposeProductId('aave:v3:ethereum:reserve:0xabc:supply')).toEqual(
      {
        provider: 'aave',
        version: 'v3',
        chainName: 'ethereum',
        productType: 'reserve',
        address: '0xabc',
        kind: 'supply',
      }
    )
  })

  it('parses compound with kind suffix', () => {
    expect(
      decomposeProductId('compoundcomet:v3:arbitrum:market:0xdef:borrow')
    ).toEqual({
      provider: 'compound',
      version: 'v3',
      chainName: 'arbitrum',
      productType: 'market',
      address: '0xdef',
      kind: 'borrow',
    })
  })

  it('parses morpho market borrow', () => {
    expect(decomposeProductId('morpho:v1:base:market:0x123:borrow')).toEqual({
      provider: 'morpho',
      version: 'v1',
      chainName: 'base',
      productType: 'market',
      address: '0x123',
      kind: 'borrow',
    })
  })

  it('parses morpho vault supply', () => {
    expect(decomposeProductId('morpho:v1:ethereum:vault:0x456:supply')).toEqual(
      {
        provider: 'morpho',
        version: 'v1',
        chainName: 'ethereum',
        productType: 'vault',
        address: '0x456',
        kind: 'supply',
      }
    )
  })

  it('returns null for legacy morpho id without kind suffix', () => {
    expect(decomposeProductId('metamorpho:v1:ethereum:vault:0x456')).toBeNull()
  })

  it('returns null for unknown prefix', () => {
    expect(decomposeProductId('weird:thing')).toBeNull()
  })
})
