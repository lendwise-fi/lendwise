import { NextRequest } from 'next/server'

import { Horizon, Keypair, Transaction } from '@stellar/stellar-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const limiter = vi.hoisted(() => ({
  limit: vi.fn(async () => ({ success: true, retryAfter: 0 })),
}))
vi.mock('@/lib/ratelimit', () => ({
  clientIp: () => '203.0.113.7',
  stellarAuthLimiter: limiter,
}))

const challenge = await import('../challenge/route')
const verify = await import('../verify/route')
const session = await import('../session/route')

const SITE = 'https://lendwise.fi'
const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

function request(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: string }
) {
  return new NextRequest(`${SITE}/api/auth/stellar/${path}`, init)
}

beforeEach(() => {
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'lendwise.fi')
  limiter.limit.mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('SEP-10 request host binding', () => {
  it.each(['127.0.0.1:3100', 'localhost:3100', 'LENDWISE.FI'])(
    'signs in against the original request host %s',
    async (host) => {
      vi.stubEnv('STELLAR_SEP10_SIGNING_SECRET', Keypair.random().secret())
      vi.stubEnv('STELLAR_SESSION_SECRET', 'route-test-session-secret')
      vi.stubEnv('NEXT_PUBLIC_NETWORK', 'mainnet')
      vi.spyOn(Horizon.Server.prototype, 'loadAccount').mockRejectedValue({
        response: { status: 404 },
      })
      const site = `http://${host}`
      const wallet = Keypair.random()
      const post = (path: string, body: Record<string, string>) =>
        new NextRequest(`${site}/api/auth/stellar/${path}`, {
          method: 'POST',
          headers: { host, origin: site, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })

      const response = await challenge.POST(
        post('challenge', { address: wallet.publicKey() })
      )
      expect(response.status).toBe(200)
      const issued = await response.json()
      const domain = new URL(site).hostname
      expect(issued.homeDomain).toBe(domain)
      expect(issued.webAuthDomain).toBe(domain)
      const tx = new Transaction(
        issued.transactionXdr,
        issued.networkPassphrase
      )
      expect(tx.operations[0]).toMatchObject({ name: `${domain} auth` })
      tx.sign(wallet)
      const signed = { address: wallet.publicKey(), transactionXdr: tx.toXDR() }
      const verified = await verify.POST(post('verify', signed))
      expect(verified.status).toBe(200)
      expect((await verified.json()).session.address).toBe(wallet.publicKey())
      expect(verified.headers.get('set-cookie')).toContain('HttpOnly')
      expect((await verify.POST(post('verify', signed))).status).toBe(401)
    }
  )

  it('refuses a forged Host even when Origin is allowed', async () => {
    vi.stubEnv('STELLAR_SEP10_SIGNING_SECRET', Keypair.random().secret())
    const response = await challenge.POST(
      new NextRequest(`${SITE}/api/auth/stellar/challenge`, {
        method: 'POST',
        headers: {
          host: 'evil.example',
          origin: SITE,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ address: G }),
      })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Host is not an allowed sign-in domain',
    })
  })
})

describe('verify route', () => {
  it('refuses the cross-site text/plain form post that plants a session', async () => {
    // What a page on another site auto-submits: the body parses as JSON.
    const res = await verify.POST(
      request('verify', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
          'content-type': 'text/plain',
        },
        body: `{"address":"${G}","transactionXdr":"AAAA","x":"="}`,
      })
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(limiter.limit).not.toHaveBeenCalled()
  })

  it('refuses a same-origin post that is not JSON', async () => {
    const res = await verify.POST(
      request('verify', {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'text/plain' },
        body: '{}',
      })
    )
    expect(res.status).toBe(415)
  })

  it('lets a same-origin JSON post through to the verification', async () => {
    const res = await verify.POST(
      request('verify', {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'application/json' },
        body: '{}',
      })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'address is required' })
  })
})

describe('challenge route', () => {
  it('refuses a cross-site POST and GET', async () => {
    const post = await challenge.POST(
      request('challenge', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ address: G }),
      })
    )
    expect(post.status).toBe(403)
    const get = await challenge.GET(
      new NextRequest(`${SITE}/api/auth/stellar/challenge?account=${G}`, {
        headers: { 'sec-fetch-site': 'cross-site' },
      })
    )
    expect(get.status).toBe(403)
    expect(limiter.limit).not.toHaveBeenCalled()
  })

  it('lets a same-origin JSON post through', async () => {
    const res = await challenge.POST(
      request('challenge', {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'application/json' },
        body: '{}',
      })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'account is required' })
  })
})

describe('session route', () => {
  it('refuses a cross-site sign-out', async () => {
    const res = await session.DELETE(
      request('session', {
        method: 'DELETE',
        headers: { origin: 'https://evil.example' },
      })
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('signs out a same-origin caller', async () => {
    const res = await session.DELETE(
      request('session', { method: 'DELETE', headers: { origin: SITE } })
    )
    expect(res.status).toBe(200)
  })
})
