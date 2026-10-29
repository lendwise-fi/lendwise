import { describe, expect, it, vi } from 'vitest'

import type { WalletHolding } from '@/lib/portfolio/types'

import { SOLANA_HOLDINGS_TTL_MS, cachedSolanaHoldings } from './holdings-cache'
import { SolanaRpcError } from './rpc'
import {
  type SolanaHoldingsRpc,
  getSolanaWalletHoldings,
} from './wallet-holdings'

vi.mock('@/lib/db/repositories/price', () => ({ latestPrice: vi.fn() }))
vi.mock('@/lib/db/postgres', () => ({ db: {} }))

// Synthetic base58 keys (32 bytes), no real wallet.
const A = 'AKjdwZT5d1S9YA6NPYyBZ5jAUAXYVJaYAVCd38hJiKS4'
const B = '8vWf48A4WLuwqKTg3VABfVsouvp6v1dAG3br3NU4Ufzs'

const ok: WalletHolding[] = []

function clock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

/** An RPC that counts every call and holds 1 SOL per wallet. */
function countingRpc(): SolanaHoldingsRpc & { calls: () => number } {
  const getBalance = vi.fn(async () => 1)
  const getTokenAccountsByOwner = vi.fn(async () => [])
  return {
    getBalance,
    getTokenAccountsByOwner,
    calls: () =>
      getBalance.mock.calls.length + getTokenAccountsByOwner.mock.calls.length,
  }
}

describe('cachedSolanaHoldings', () => {
  it('makes no RPC call for a second load within the TTL', async () => {
    const c = clock()
    const rpc = countingRpc()
    const cached = cachedSolanaHoldings(
      (owners) =>
        getSolanaWalletHoldings(owners, {
          rpc,
          price: async () => 150,
          symbolsByMint: async () => new Map(),
        }),
      { now: c.now }
    )
    const first = await cached([A])
    const afterFirst = rpc.calls()
    expect(afterFirst).toBe(3)

    c.advance(SOLANA_HOLDINGS_TTL_MS - 1)
    expect(await cached([A])).toBe(first)
    expect(rpc.calls()).toBe(afterFirst)

    c.advance(1)
    await cached([A])
    expect(rpc.calls()).toBe(afterFirst * 2)
  })

  it('shares one read between identical concurrent calls, in any order', async () => {
    let release: (v: WalletHolding[]) => void = () => {}
    const read = vi.fn(() => new Promise<WalletHolding[]>((r) => (release = r)))
    const cached = cachedSolanaHoldings(read)
    const first = cached([A, B])
    const second = cached([B, A])
    release(ok)
    expect(await first).toBe(ok)
    expect(await second).toBe(ok)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed read, and the next call reads again', async () => {
    const read = vi
      .fn<(owners: string[]) => Promise<WalletHolding[]>>()
      .mockRejectedValueOnce(
        new SolanaRpcError('http', 'getBalance', 'HTTP 429', 429)
      )
      .mockResolvedValueOnce(ok)
    const cached = cachedSolanaHoldings(read)
    await expect(cached([A])).rejects.toBeInstanceOf(SolanaRpcError)
    expect(await cached([A])).toBe(ok)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keys addresses with their case: a lowercased key is another wallet', async () => {
    const read = vi.fn(async () => ok)
    const cached = cachedSolanaHoldings(read)
    await cached([A])
    await cached([A.toLowerCase()])
    expect(read).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenNthCalledWith(1, [A])
    expect(read).toHaveBeenNthCalledWith(2, [A.toLowerCase()])
  })

  it('keeps different wallet sets apart', async () => {
    const read = vi.fn(async () => ok)
    const cached = cachedSolanaHoldings(read)
    await cached([A])
    await cached([A, B])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('stays bounded', async () => {
    const read = vi.fn(async () => ok)
    const cached = cachedSolanaHoldings(read, { maxEntries: 2 })
    await cached([A])
    await cached([B])
    await cached([A, B])
    await cached([A])
    expect(read).toHaveBeenCalledTimes(4)
  })
})
