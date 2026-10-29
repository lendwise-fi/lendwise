import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type SiwsChallengeRecord,
  consumeSiwsChallenge,
  rememberSiwsChallenge,
} from './solana-challenge-store'

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

const NONCE = '0123456789abcdef0123456789abcdef'

function record(): SiwsChallengeRecord {
  return {
    address: 'FcP2xWWnEybVnLmbf2HT9EXr7ynNpEZsrUb5QB9qZ1Bb',
    domain: 'lendwise.fi',
    message: 'lendwise.fi wants you to sign in with your Solana account:\n…',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  }
}

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
  redis.getdel.mockReset()
  redis.set.mockReset()
})

describe('SIWS challenge store with Redis', () => {
  it('stores the message under its nonce with NX and the challenge TTL', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    try {
      redis.set.mockResolvedValueOnce('OK')
      const r = record()
      await rememberSiwsChallenge(NONCE, r)
      expect(redis.set).toHaveBeenCalledWith(
        `lw:siws:challenge:${NONCE}`,
        r,
        expect.objectContaining({ nx: true, ex: 300 })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a duplicate nonce', async () => {
    redis.set.mockResolvedValueOnce(null)
    await expect(rememberSiwsChallenge(NONCE, record())).rejects.toThrow(
      'already exists'
    )
  })

  it('consumes a challenge once, atomically: the second attempt finds nothing', async () => {
    const r = record()
    redis.getdel.mockResolvedValueOnce(r).mockResolvedValueOnce(null)
    expect(await consumeSiwsChallenge(NONCE)).toEqual(r)
    expect(await consumeSiwsChallenge(NONCE)).toBeNull()
    expect(redis.getdel).toHaveBeenCalledWith(`lw:siws:challenge:${NONCE}`)
  })

  it('reads a record that comes back as a JSON string', async () => {
    const r = record()
    redis.getdel.mockResolvedValueOnce(JSON.stringify(r))
    expect(await consumeSiwsChallenge(NONCE)).toEqual(r)
  })

  it('treats a malformed stored value as no challenge', async () => {
    for (const value of [
      'not json',
      42,
      { ...record(), message: undefined },
      { ...record(), expiresAt: '300' },
      { ...record(), address: 7 },
    ]) {
      redis.getdel.mockResolvedValueOnce(value)
      expect(await consumeSiwsChallenge(NONCE)).toBeNull()
    }
  })
})
