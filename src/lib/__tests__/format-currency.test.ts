import { describe, expect, expectTypeOf, it } from 'vitest'

import { formatCompactCurrency } from '@/lib/format-currency'

describe('formatCompactCurrency', () => {
  it('accepts known values and optional numeric decimals', () => {
    expectTypeOf<Parameters<typeof formatCompactCurrency>[0]>().toEqualTypeOf<
      number | string
    >()
    expectTypeOf<Parameters<typeof formatCompactCurrency>[2]>().toEqualTypeOf<
      number | undefined
    >()
  })

  it('formats zero as a known balance', () => {
    expect(formatCompactCurrency(0, 'USD')).toBe('$0')
    expect(formatCompactCurrency('0', 'USDC', 7)).toBe('0 USDC')
  })

  it('scales raw integer strings before rounding for display', () => {
    expect(formatCompactCurrency('2500000', 'USDC', 7)).toBe('0.25 USDC')
    expect(formatCompactCurrency('100049999999999992', 'ETH', 18)).toBe('0.1 Ξ')
  })
})
