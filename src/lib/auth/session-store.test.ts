import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  allowRequest,
  isStellarSessionRevoked,
  resetLocalSessionStore,
  revokeStellarSession,
} from './session-store'

const now = () => Math.floor(Date.now() / 1000)

beforeEach(() => {
  vi.unstubAllEnvs()
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  resetLocalSessionStore()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('revocation (in-memory)', () => {
  it('reports a revoked session until its expiry', async () => {
    await revokeStellarSession('sid-a', now() + 60)
    expect(await isStellarSessionRevoked('sid-a')).toBe(true)
    expect(await isStellarSessionRevoked('sid-b')).toBe(false)
  })

  it('forgets a revocation after the session would have expired', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    await revokeStellarSession('sid-old', now() + 10)
    vi.setSystemTime(new Date('2030-01-01T00:00:20Z'))
    expect(await isStellarSessionRevoked('sid-old')).toBe(false)
  })
})

describe('allowRequest (in-memory)', () => {
  it('allows calls up to the limit, then blocks until the window resets', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const opts = { key: 'ip:1.2.3.4', limit: 2, windowSeconds: 60 }
    expect(await allowRequest(opts)).toBe(true)
    expect(await allowRequest(opts)).toBe(true)
    expect(await allowRequest(opts)).toBe(false)

    vi.setSystemTime(new Date('2030-01-01T00:01:01Z'))
    expect(await allowRequest(opts)).toBe(true)
  })

  it('keeps keys independent', async () => {
    const base = { limit: 1, windowSeconds: 60 }
    expect(await allowRequest({ ...base, key: 'a' })).toBe(true)
    expect(await allowRequest({ ...base, key: 'a' })).toBe(false)
    expect(await allowRequest({ ...base, key: 'b' })).toBe(true)
  })
})

describe('production requires a shared store', () => {
  it('refuses to revoke or rate limit without Upstash in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(revokeStellarSession('sid-x', now() + 60)).rejects.toThrow(
      'required in production'
    )
    await expect(
      allowRequest({ key: 'k', limit: 1, windowSeconds: 60 })
    ).rejects.toThrow('required in production')
  })
})
