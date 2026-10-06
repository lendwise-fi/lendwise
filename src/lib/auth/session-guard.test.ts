import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertSessionAddress, requireStellarSession } from './session-guard'
import { resetLocalSessionStore, revokeStellarSession } from './session-store'
import { type StellarSessionPayload, signSession } from './stellar-sep10'

const cookieStore = vi.hoisted(() => ({
  value: undefined as string | undefined,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'stellar_session' && cookieStore.value !== undefined
        ? { value: cookieStore.value }
        : undefined,
  }),
}))

const ACCOUNT = 'GA4VFXY7QQFNU4R6JLRFSO3EWRA6CUCNNGB6V3YOF3NZDC4TPOCOUM2E'
const OTHER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const PASSPHRASE = 'Test SDF Network ; September 2015'

function sessionPayload(
  overrides: Partial<StellarSessionPayload> = {}
): StellarSessionPayload {
  const now = Math.floor(Date.now() / 1000)
  return {
    sid: 'sid-test-0123456789abcdef',
    address: ACCOUNT,
    networkPassphrase: PASSPHRASE,
    issuedAt: now,
    expiresAt: now + 3600,
    ...overrides,
  }
}

beforeEach(() => {
  process.env.STELLAR_SESSION_SECRET = 'test-session-secret'
  cookieStore.value = undefined
  resetLocalSessionStore()
})

describe('requireStellarSession', () => {
  it('returns the session for a valid cookie', async () => {
    cookieStore.value = signSession(sessionPayload())
    const session = await requireStellarSession()
    expect(session.address).toBe(ACCOUNT)
  })

  it('throws when the cookie is missing', async () => {
    await expect(requireStellarSession()).rejects.toThrow(
      'Stellar sign-in required'
    )
  })

  it('throws when the token body is forged', async () => {
    const token = signSession(sessionPayload())
    const [, sig] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify(sessionPayload({ address: OTHER })),
      'utf8'
    ).toString('base64url')
    cookieStore.value = `${forged}.${sig}`
    await expect(requireStellarSession()).rejects.toThrow(
      'Stellar sign-in required'
    )
  })

  it('throws once the session has been revoked', async () => {
    const payload = sessionPayload()
    cookieStore.value = signSession(payload)
    await revokeStellarSession(payload.sid, payload.expiresAt)
    await expect(requireStellarSession()).rejects.toThrow(
      'Stellar sign-in required'
    )
  })

  it('rejects a session without a session ID', async () => {
    const legacy = { ...sessionPayload(), sid: undefined }
    cookieStore.value = signSession(legacy as unknown as StellarSessionPayload)
    await expect(requireStellarSession()).rejects.toThrow(
      'Stellar sign-in required'
    )
  })
})

describe('assertSessionAddress', () => {
  const session = sessionPayload({ issuedAt: 1, expiresAt: 2 })

  it('passes when the account matches the session', () => {
    expect(() => assertSessionAddress(session, ACCOUNT)).not.toThrow()
  })

  it('throws when the account differs from the session', () => {
    expect(() => assertSessionAddress(session, OTHER)).toThrow(
      'does not match the signed-in account'
    )
  })
})
