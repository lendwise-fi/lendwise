import { afterEach, describe, expect, it, vi } from 'vitest'

import { solanaPositionAdapters } from '@/config/protocols-server'

// The positions module reads prices from the database.
vi.mock('@/lib/risk/prices', () => ({
  resolveRiskPrices: vi.fn(async () => new Map()),
}))

describe('solanaPositionAdapters', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('registers Kamino Lend', () => {
    expect(Object.keys(solanaPositionAdapters())).toEqual(['kamino_v1'])
  })

  it('keeps it on a testnet deployment: Solana data is mainnet-beta everywhere', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NEXT_PUBLIC_NETWORK', 'testnet')
    expect(Object.keys(solanaPositionAdapters())).toEqual(['kamino_v1'])
  })

  it('loads the Kamino positions adapter', async () => {
    const adapter = await solanaPositionAdapters().kamino_v1()
    expect(typeof adapter.getUserSupplyPositions).toBe('function')
    expect(typeof adapter.getUserBorrowPositions).toBe('function')
    expect(typeof adapter.getRiskAccounts).toBe('function')
  })
})
