import { describe, expect, it } from 'vitest'

import {
  PROTOCOLS_META,
  adapterIdsForProvider,
  protocolDisplayName,
  protocolVersionName,
} from '@/config/protocols-meta'

describe('PROTOCOLS_META', () => {
  it('exposes every live protocol with complete metadata', () => {
    expect(Object.keys(PROTOCOLS_META).sort()).toEqual([
      'aave_v3',
      'blend_v2.1',
      'compound_v3',
      'morpho_v1',
    ])
    for (const meta of Object.values(PROTOCOLS_META)) {
      expect(meta.displayName).toBeTruthy()
      expect(meta.versionName).toBeTruthy()
      expect(meta.provider).toBeTruthy()
    }
  })

  it('resolves names and providers without parsing ids', () => {
    expect(protocolVersionName('aave_v3')).toBe('Aave v3')
    expect(protocolVersionName('nope')).toBe('n/a')
    expect(protocolDisplayName('morpho_v1')).toBe('Morpho')
    expect(adapterIdsForProvider('compound')).toEqual(['compound_v3'])
    // Retired Blend versions are not adapters any more: heal never loads them.
    expect(adapterIdsForProvider('blend')).toEqual(['blend_v2.1'])
    expect(protocolVersionName('blend_v2.1')).toBe('Blend v2.1')
    expect(adapterIdsForProvider('unknown')).toEqual([])
  })
})
