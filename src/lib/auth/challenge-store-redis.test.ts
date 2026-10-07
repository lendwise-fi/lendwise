import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  consumeSep10Challenge,
  rememberSep10Challenge,
} from './stellar-challenge-store'

const redis = vi.hoisted(() => ({
  getdel: vi.fn(),
  set: vi.fn(),
}))

vi.mock('@upstash/redis', () => ({
  Redis: class {
    getdel = redis.getdel
    set = redis.set
  },
}))

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
  redis.getdel.mockReset()
  redis.set.mockReset()
})

describe('challenge consumption with Redis', () => {
  it('consumes a challenge once: the second attempt finds nothing', async () => {
    redis.getdel.mockResolvedValueOnce('1').mockResolvedValueOnce(null)
    expect(await consumeSep10Challenge('hash-1')).toBe(true)
    expect(await consumeSep10Challenge('hash-1')).toBe(false)
    expect(redis.getdel).toHaveBeenCalledWith('lw:sep10:challenge:hash-1')
  })

  it('stores the challenge with NX and a TTL', async () => {
    redis.set.mockResolvedValueOnce('OK')
    const expiresAt = Math.floor(Date.now() / 1000) + 300
    await rememberSep10Challenge({ hash: 'hash-2', expiresAt })
    expect(redis.set).toHaveBeenCalledWith(
      'lw:sep10:challenge:hash-2',
      '1',
      expect.objectContaining({ nx: true })
    )
  })

  it('rejects a duplicate challenge nonce', async () => {
    redis.set.mockResolvedValueOnce(null)
    await expect(
      rememberSep10Challenge({
        hash: 'hash-3',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
      })
    ).rejects.toThrow('already exists')
  })
})
