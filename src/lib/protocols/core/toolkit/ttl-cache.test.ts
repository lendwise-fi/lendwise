import { describe, expect, it, vi } from 'vitest'

import { TtlCache } from './ttl-cache'

describe('TtlCache', () => {
  const clock = () => {
    let t = 0
    return { now: () => t, advance: (ms: number) => (t += ms) }
  }

  it('serves a resolved read from memory until the TTL ends', async () => {
    const c = clock()
    const cache = new TtlCache<number>({
      ttlMs: 100,
      maxEntries: 10,
      now: c.now,
    })
    const read = vi.fn(async () => 1)
    await cache.get('k', read)
    c.advance(99)
    await expect(cache.get('k', read)).resolves.toBe(1)
    expect(read).toHaveBeenCalledTimes(1)
    c.advance(1)
    await cache.get('k', read)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('shares one pending read between concurrent callers', async () => {
    const cache = new TtlCache<number>({ ttlMs: 100, maxEntries: 10 })
    const read = vi.fn(async () => 2)
    await Promise.all([cache.get('k', read), cache.get('k', read)])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('keeps no rejection', async () => {
    const cache = new TtlCache<number>({ ttlMs: 100, maxEntries: 10 })
    await expect(
      cache.get('k', async () => {
        throw new Error('down')
      })
    ).rejects.toThrow('down')
    await expect(cache.get('k', async () => 3)).resolves.toBe(3)
  })

  it('drops the oldest entry past maxEntries', async () => {
    const cache = new TtlCache<string>({ ttlMs: 1_000, maxEntries: 2 })
    await cache.get('a', async () => 'a')
    await cache.get('b', async () => 'b')
    await cache.get('c', async () => 'c')
    const read = vi.fn(async () => 'a2')
    await expect(cache.get('a', read)).resolves.toBe('a2')
    expect(read).toHaveBeenCalledTimes(1)
  })
})
