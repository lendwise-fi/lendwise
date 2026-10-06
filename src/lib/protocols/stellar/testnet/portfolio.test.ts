import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { positionsFromStellarBalances } from './portfolio'

const ORIGINAL_ENV = { ...process.env }

describe('positionsFromStellarBalances', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('turns native XLM and configured USDC trustlines into supply positions', () => {
    process.env.STELLAR_TESTNET_FIXTURE_XLM_PRICE_USD = '0.12'
    process.env.STELLAR_TESTNET_FIXTURE_USDC_PRICE_USD = '1'
    process.env.STELLAR_TESTNET_USDC_ISSUER = 'GISSUER'

    const positions = positionsFromStellarBalances({
      address: 'GUSER',
      balances: [
        { asset_type: 'native', balance: '25.5' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GISSUER',
          balance: '12.25',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'EURC',
          asset_issuer: 'GISSUER',
          balance: '50',
        },
      ],
    })

    expect(positions.map((p) => p.assetSymbol)).toEqual(['XLM', 'USDC'])
    expect(positions[0].assetAddress).toBe('native')
    expect(positions[0].assetAmountUsd).toBeCloseTo(3.06)
    expect(positions[1]).toMatchObject({
      assetAddress: 'USDC:GISSUER',
      assetAmountUsd: 12.25,
    })
  })

  it('ignores zero balances and unrelated USDC issuers', () => {
    process.env.STELLAR_TESTNET_USDC_ISSUER = 'GEXPECTED'

    const positions = positionsFromStellarBalances({
      address: 'GUSER',
      balances: [
        { asset_type: 'native', balance: '0' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GOTHER',
          balance: '20',
        },
      ],
    })

    expect(positions).toEqual([])
  })
})
