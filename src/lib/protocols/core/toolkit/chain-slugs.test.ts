import { describe, expect, it } from 'vitest'

import { CHAIN_BY_ID, CHAIN_BY_SLUG, chainSlugFor } from './chain-slugs'

describe('chain registry — Solana', () => {
  it('maps the assigned chainId -2 to the solana slug', () => {
    expect(chainSlugFor(-2)).toBe('solana')
    expect(CHAIN_BY_SLUG.solana.chainId).toBe(-2)
  })

  it('carries the Solana mainnet CAIP-2 and its own family', () => {
    expect(CHAIN_BY_ID[-2]).toMatchObject({
      name: 'Solana',
      family: 'solana',
      caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    })
  })
})
