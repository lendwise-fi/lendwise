import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isSolanaSessionRevoked,
  isStellarSessionRevoked,
  resetLocalSessionStore,
  revokeSolanaSession,
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

describe('Solana revocation (in-memory)', () => {
  it('reports a revoked Solana session until its expiry', async () => {
    await revokeSolanaSession('sid-sol', now() + 60)
    expect(await isSolanaSessionRevoked('sid-sol')).toBe(true)
    expect(await isSolanaSessionRevoked('sid-other')).toBe(false)
  })

  it('keeps the Stellar and Solana revocations apart', async () => {
    await revokeSolanaSession('sid-shared', now() + 60)
    expect(await isStellarSessionRevoked('sid-shared')).toBe(false)
    await revokeStellarSession('sid-stellar-only', now() + 60)
    expect(await isSolanaSessionRevoked('sid-stellar-only')).toBe(false)
  })

  it('forgets a Solana revocation after the session would have expired', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    await revokeSolanaSession('sid-sol-old', now() + 10)
    vi.setSystemTime(new Date('2030-01-01T00:00:20Z'))
    expect(await isSolanaSessionRevoked('sid-sol-old')).toBe(false)
  })
})

describe('production requires a shared store', () => {
  it('refuses to revoke without Upstash in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(revokeStellarSession('sid-x', now() + 60)).rejects.toThrow(
      'required in production'
    )
    await expect(revokeSolanaSession('sid-x', now() + 60)).rejects.toThrow(
      'required in production'
    )
  })
})
