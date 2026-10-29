/**
 * `loadUserPortfolio` checks the per-IP portfolio limit before any read: the
 * client IP comes from the action's request headers, and a refused load
 * returns the rate-limit shape instead of throwing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyPortfolio } from '@/lib/portfolio/types'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  limit: vi.fn(),
  loadPortfolio: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('@/lib/ratelimit', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ratelimit')>()),
  portfolioLimiter: { limit: mocks.limit },
}))
vi.mock('@/lib/portfolio/load', () => ({ loadPortfolio: mocks.loadPortfolio }))
vi.mock('@/config/protocols-server', () => ({
  APP_ADAPTERS: {},
  solanaPositionAdapters: () => ({}),
  stellarPositionAdapters: () => ({}),
}))
vi.mock('@/lib/db/postgres', () => ({ db: {} }))
// The real readers need RPC configuration at import; none is called here.
vi.mock('@/lib/evm/holdings-chains', () => ({ holdingsChains: () => [] }))
vi.mock('@/lib/evm/holdings-catalog', () => ({
  loadCatalogTokens: vi.fn(),
  loadHoldingPrices: vi.fn(),
}))
vi.mock('@/lib/evm/wallet-holdings', () => ({ getEvmWalletHoldings: vi.fn() }))

const { loadUserPortfolio } =
  await import('@/app/actions/user-portfolio.actions')

const WALLETS = [
  {
    address: '0x00000000000000000000000000000000000000A1',
    chainFamily: 'evm' as const,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.headers.mockResolvedValue(
    new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
  )
})

describe('loadUserPortfolio rate limit', () => {
  it('limits on the first forwarded IP, then loads', async () => {
    const portfolio = emptyPortfolio()
    mocks.limit.mockResolvedValue({ success: true, retryAfter: 0 })
    mocks.loadPortfolio.mockResolvedValue(portfolio)
    expect(await loadUserPortfolio(WALLETS)).toBe(portfolio)
    expect(mocks.limit).toHaveBeenCalledWith('203.0.113.7')
    expect(mocks.loadPortfolio).toHaveBeenCalledTimes(1)
    expect(mocks.loadPortfolio.mock.calls[0][0]).toEqual(WALLETS)
  })

  it('returns the rate-limit shape over the limit, and reads nothing', async () => {
    mocks.limit.mockResolvedValue({ success: false, retryAfter: 42 })
    expect(await loadUserPortfolio(WALLETS)).toEqual({
      error: 'Rate limit exceeded. Retry shortly.',
      retryAfter: 42,
    })
    expect(mocks.loadPortfolio).not.toHaveBeenCalled()
  })
})
