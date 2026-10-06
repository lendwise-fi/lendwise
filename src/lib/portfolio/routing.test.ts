import { describe, expect, it } from 'vitest'

import { routePortfolioWallets } from './routing'
import { mergeUserPositions } from './types'

describe('routePortfolioWallets', () => {
  it('routes Stellar addresses only to Stellar adapters', () => {
    const routed = routePortfolioWallets([
      {
        chainFamily: 'evm',
        address: '0x0000000000000000000000000000000000000001',
      },
      {
        chainFamily: 'stellar',
        address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      },
      { chainFamily: 'evm', address: 'GDOESNOTGOTOEVM' },
    ])

    expect(routed.evmAddresses).toEqual([
      '0x0000000000000000000000000000000000000001',
    ])
    expect(routed.stellarAddresses).toEqual([
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    ])
  })
})

describe('mergeUserPositions', () => {
  it('merges protocol maps without dropping either chain family', () => {
    const merged = mergeUserPositions(
      {
        supply: { aave_v3: [{ id: 'evm' }] as never },
        borrow: {},
      },
      {
        supply: { blend_v1: [{ id: 'stellar' }] as never },
        borrow: { morpho_v1: [{ id: 'borrow' }] as never },
      }
    )

    expect(merged.supply.aave_v3).toHaveLength(1)
    expect(merged.supply.blend_v1).toHaveLength(1)
    expect(merged.borrow.morpho_v1).toHaveLength(1)
  })
})
