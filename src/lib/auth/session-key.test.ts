import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type StellarSessionPayload,
  signSession,
  verifySessionToken,
} from './stellar-sep10'

const payload: StellarSessionPayload = {
  sid: 'sid-key-test-0123456789',
  address: 'GA4VFXY7QQFNU4R6JLRFSO3EWRA6CUCNNGB6V3YOF3NZDC4TPOCOUM2E',
  networkPassphrase: 'Test SDF Network ; September 2015',
  issuedAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
}

beforeEach(() => {
  vi.unstubAllEnvs()
  delete process.env.STELLAR_SESSION_SECRET
  process.env.STELLAR_SEP10_SIGNING_SECRET = 'signing-secret-for-tests'
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('session key derivation', () => {
  it('uses the dedicated session secret when set', () => {
    process.env.STELLAR_SESSION_SECRET = 'dedicated-secret'
    const token = signSession(payload)
    expect(verifySessionToken(token)?.sid).toBe(payload.sid)

    // A token signed with the dedicated secret is not accepted under another.
    process.env.STELLAR_SESSION_SECRET = 'another-secret'
    expect(verifySessionToken(token)).toBeNull()
  })

  it('never signs with the raw SEP-10 signing key', () => {
    process.env.STELLAR_SESSION_SECRET = 'dedicated-secret'
    const token = signSession(payload)
    // Only the dedicated secret verifies; the signing key alone must not.
    process.env.STELLAR_SESSION_SECRET = 'signing-secret-for-tests'
    expect(verifySessionToken(token)).toBeNull()
  })

  it('refuses to sign in production without a dedicated secret', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => signSession(payload)).toThrow(
      'STELLAR_SESSION_SECRET is not configured'
    )
    expect(verifySessionToken('anything.at-all')).toBeNull()
  })

  it('rejects tokens without a session ID', () => {
    process.env.STELLAR_SESSION_SECRET = 'dedicated-secret'
    const { sid: _sid, ...withoutSid } = payload
    const token = signSession(withoutSid as StellarSessionPayload)
    expect(verifySessionToken(token)).toBeNull()
  })
})
