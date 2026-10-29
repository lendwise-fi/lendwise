import { describe, expect, it, vi } from 'vitest'

import { PORTFOLIO_RATE_LIMIT_MESSAGE, limitPortfolioLoad } from './rate-limit'
import { emptyPortfolio, isPortfolioRateLimited } from './types'

const IP = '203.0.113.7'

describe('limitPortfolioLoad', () => {
  it('runs the load under the limit, keyed by the caller IP', async () => {
    const portfolio = emptyPortfolio()
    const limit = vi.fn(async () => ({ success: true, retryAfter: 0 }))
    const load = vi.fn(async () => portfolio)
    const result = await limitPortfolioLoad({ ip: async () => IP, limit, load })
    expect(result).toBe(portfolio)
    expect(isPortfolioRateLimited(result)).toBe(false)
    expect(limit).toHaveBeenCalledWith(IP)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("returns the optimizer's rate-limit shape over the limit, without loading", async () => {
    const load = vi.fn(async () => emptyPortfolio())
    const result = await limitPortfolioLoad({
      ip: async () => IP,
      limit: async () => ({ success: false, retryAfter: 12 }),
      load,
    })
    expect(result).toEqual({
      error: 'Rate limit exceeded. Retry shortly.',
      retryAfter: 12,
    })
    expect(PORTFOLIO_RATE_LIMIT_MESSAGE).toBe(
      'Rate limit exceeded. Retry shortly.'
    )
    expect(isPortfolioRateLimited(result)).toBe(true)
    expect(load).not.toHaveBeenCalled()
  })

  it('fails open when the limit check throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const portfolio = emptyPortfolio()
    const result = await limitPortfolioLoad({
      ip: async () => {
        throw new Error('no request scope')
      },
      limit: async () => ({ success: false, retryAfter: 60 }),
      load: async () => portfolio,
    })
    expect(result).toBe(portfolio)
  })

  it('does not catch a failing load: that stays the caller error path', async () => {
    await expect(
      limitPortfolioLoad({
        ip: async () => IP,
        limit: async () => ({ success: true, retryAfter: 0 }),
        load: async () => {
          throw new Error('boom')
        },
      })
    ).rejects.toThrow('boom')
  })
})
