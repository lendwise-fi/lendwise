import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertSessionAddress, requireStellarSession } from './session-guard'
import { signSession } from './stellar-sep10'

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

function validToken(address = ACCOUNT) {
  const now = Math.floor(Date.now() / 1000)
  return signSession({
    address,
    networkPassphrase: 'Test SDF Network ; September 2015',
    issuedAt: now,
    expiresAt: now + 3600,
  })
}

beforeEach(() => {
  process.env.STELLAR_SESSION_SECRET = 'test-session-secret'
  cookieStore.value = undefined
})

describe('requireStellarSession', () => {
  it('returns the session for a valid cookie', async () => {
    cookieStore.value = validToken()
    const session = await requireStellarSession()
    expect(session.address).toBe(ACCOUNT)
  })

  it('throws when the cookie is missing', async () => {
    await expect(requireStellarSession()).rejects.toThrow(
      'Stellar sign-in required'
    )
  })

  it('throws when the token signature is tampered', async () => {
    const token = validToken()
    const [body, sig] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({
        address: OTHER,
        networkPassphrase: 'Test SDF Network ; September 2015',
        issuedAt: 1,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
      'utf8'
    ).toString('base64url')
    cookieStore.value = `${forged}.${sig}`
    expect(body).not.toBe(forged)
    await expect(requireStellarSession()).rejects.toThrow(
      'Stellar sign-in required'
    )
  })
})

describe('assertSessionAddress', () => {
  const session = {
    address: ACCOUNT,
    networkPassphrase: 'Test SDF Network ; September 2015',
    issuedAt: 1,
    expiresAt: 2,
  }

  it('passes when the account matches the session', () => {
    expect(() => assertSessionAddress(session, ACCOUNT)).not.toThrow()
  })

  it('throws when the account differs from the session', () => {
    expect(() => assertSessionAddress(session, OTHER)).toThrow(
      'does not match the signed-in account'
    )
  })
})
