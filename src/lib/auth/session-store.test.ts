import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
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

describe('production requires a shared store', () => {
  it('refuses to revoke without Upstash in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(revokeStellarSession('sid-x', now() + 60)).rejects.toThrow(
      'required in production'
    )
  })
})
