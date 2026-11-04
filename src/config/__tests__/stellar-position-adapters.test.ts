import { describe, expect, it } from 'vitest'

import { stellarPositionAdapters } from '@/config/protocols-server'

const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

describe('stellarPositionAdapters', () => {
  it('registers XOXNO and Blend v2.1 by default', () => {
    expect(Object.keys(stellarPositionAdapters({}))).toEqual([
      'xoxno_v1',
      'blend_v2.1',
    ])
  })

  it('adds the fixture on a mainnet preview with an address', () => {
    expect(
      Object.keys(
        stellarPositionAdapters({
          VERCEL_ENV: 'preview',
          NEXT_PUBLIC_NETWORK: 'mainnet',
          STELLAR_RISK_FIXTURE_ADDRESS: G,
        })
      )
    ).toEqual(['xoxno_v1', 'blend_v2.1', 'stellar_fixture'])
  })

  it('reads no protocol positions on a preview without the variable', () => {
    // A preview defaults to testnet, where Blend v2.1 and the fixture have no pools.
    expect(
      stellarPositionAdapters({
        VERCEL_ENV: 'preview',
        STELLAR_RISK_FIXTURE_ADDRESS: G,
      })
    ).toEqual({})
  })

  it('never adds it in production', () => {
    expect(
      Object.keys(
        stellarPositionAdapters({
          VERCEL_ENV: 'production',
          STELLAR_RISK_FIXTURE_ADDRESS: G,
        })
      )
    ).toEqual(['xoxno_v1', 'blend_v2.1'])
  })
})
