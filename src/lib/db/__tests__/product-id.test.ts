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

  it('infers borrow for morphoblue (no kind suffix)', () => {
    expect(decomposeProductId('morphoblue:v1:base:market:0x123')).toEqual({
      provider: 'morpho',
      version: 'v1',
      chainName: 'base',
      productType: 'market',
      address: '0x123',
      kind: 'borrow',
    })
  })

  it('infers supply for metamorpho vault (no kind suffix)', () => {
    expect(decomposeProductId('metamorpho:v1:ethereum:vault:0x456')).toEqual({
      provider: 'morpho',
      version: 'v1',
      chainName: 'ethereum',
      productType: 'vault',
      address: '0x456',
      kind: 'supply',
    })
  })

  it('returns null for unknown prefix', () => {
    expect(decomposeProductId('weird:thing')).toBeNull()
  })
})
