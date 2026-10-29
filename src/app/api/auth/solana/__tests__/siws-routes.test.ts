import { NextRequest } from 'next/server'

import { base58 } from '@scure/base'
import { type KeyObject, generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetLocalSessionStore } from '@/lib/auth/session-store'
import { resetLocalSiwsChallenges } from '@/lib/auth/solana-challenge-store'

const limiter = vi.hoisted(() => ({
  limit: vi.fn(async () => ({ success: true, retryAfter: 0 })),
}))
vi.mock('@/lib/ratelimit', () => ({
  clientIp: () => '203.0.113.7',
  solanaAuthLimiter: limiter,
}))

const challengeRoute = await import('../challenge/route')
const verifyRoute = await import('../verify/route')
const sessionRoute = await import('../session/route')

const SITE = 'https://lendwise.fi'
const JSON_HEADERS = { origin: SITE, 'content-type': 'application/json' }

interface Wallet {
  address: string
  privateKey: KeyObject
}

function wallet(): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)
  return { address: base58.encode(raw), privateKey }
}

const signText = (text: string, signer: Wallet) =>
  sign(null, Buffer.from(text, 'utf8'), signer.privateKey).toString('base64')

function request(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: string }
) {
  return new NextRequest(`${SITE}/api/auth/solana/${path}`, init)
}

const post = (path: string, body: unknown, headers = JSON_HEADERS) =>
  request(path, { method: 'POST', headers, body: JSON.stringify(body) })

async function challengeFor(address: string) {
  const res = await challengeRoute.POST(post('challenge', { address }))
  expect(res.status).toBe(200)
  return (await res.json()) as {
    address: string
    nonce: string
    message: string
    domain: string
    uri: string
    issuedAt: string
    expiresAt: string
  }
}

function sessionCookie(res: Response): string | undefined {
  return res.headers
    .get('set-cookie')
    ?.match(/(?:^|,\s*)solana_session=([^;]*)/)?.[1]
}

let user: Wallet

beforeEach(() => {
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'lendwise.fi')
  vi.stubEnv('STELLAR_SESSION_SECRET', 'test-session-secret')
  limiter.limit.mockClear()
  limiter.limit.mockImplementation(async () => ({
    success: true,
    retryAfter: 0,
  }))
  resetLocalSiwsChallenges()
  resetLocalSessionStore()
  user = wallet()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('challenge route', () => {
  it('returns the SIWS message for the host the request reached', async () => {
    const res = await challengeRoute.POST(
      post('challenge', {
        address: user.address,
        // A client-supplied domain or URI is ignored.
        domain: 'evil.example',
        uri: 'https://evil.example',
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      address: user.address,
      domain: 'lendwise.fi',
      uri: 'https://lendwise.fi',
    })
    expect(body.message).toMatch(
      /^lendwise\.fi wants you to sign in with your Solana account:\n/
    )
    expect(body.message).toContain('\nURI: https://lendwise.fi\n')
    expect(body.message).not.toContain('evil.example')
    expect(Object.keys(body).sort()).toEqual(
      [
        'address',
        'domain',
        'expiresAt',
        'issuedAt',
        'message',
        'nonce',
        'uri',
      ].sort()
    )
  })

  it('requires an address and refuses an invalid one with 400', async () => {
    const missing = await challengeRoute.POST(post('challenge', {}))
    expect(missing.status).toBe(400)
    expect(await missing.json()).toEqual({ error: 'address is required' })

    for (const body of [null, [], 'text', { address: 'not-a-key' }]) {
      const res = await challengeRoute.POST(post('challenge', body))
      expect(res.status).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
  })

  it('refuses a cross-site or non-JSON request before the rate limit', async () => {
    const cross = await challengeRoute.POST(
      post(
        'challenge',
        { address: user.address },
        { origin: 'https://evil.example', 'content-type': 'application/json' }
      )
    )
    expect(cross.status).toBe(403)
    const form = await challengeRoute.POST(
      request('challenge', {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'text/plain' },
        body: JSON.stringify({ address: user.address }),
      })
    )
    expect(form.status).toBe(415)
    expect(limiter.limit).not.toHaveBeenCalled()
  })

  it('answers 429 with Retry-After once the limit is spent', async () => {
    limiter.limit.mockImplementationOnce(async () => ({
      success: false,
      retryAfter: 42,
    }))
    const res = await challengeRoute.POST(
      post('challenge', { address: user.address })
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('42')
  })

  it('answers a forged host with 400', async () => {
    const res = await challengeRoute.POST(
      new NextRequest('https://evil.example/api/auth/solana/challenge', {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'application/json' },
        body: JSON.stringify({ address: user.address }),
      })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Host is not an allowed sign-in domain',
    })
  })
})

describe('verify route', () => {
  it('signs in, sets the solana_session cookie, and refuses the replay', async () => {
    const challenge = await challengeFor(user.address)
    const body = {
      address: user.address,
      nonce: challenge.nonce,
      signature: signText(challenge.message, user),
    }

    const res = await verifyRoute.POST(post('verify', body))
    expect(res.status).toBe(200)
    const { session } = await res.json()
    expect(session).toMatchObject({
      address: user.address,
      chain: 'solana:mainnet',
    })
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(sessionCookie(res)).toBeTruthy()
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=lax/i)
    expect(setCookie).toMatch(/Path=\//)
    expect(setCookie).toMatch(/Expires=/i)

    const replay = await verifyRoute.POST(post('verify', body))
    expect(replay.status).toBe(401)
    expect(replay.headers.get('set-cookie')).toBeNull()
  })

  it('ignores a message sent by the client and verifies the stored one', async () => {
    const challenge = await challengeFor(user.address)
    const forged = challenge.message.replace('lendwise.fi', 'evil.example')
    const res = await verifyRoute.POST(
      post('verify', {
        address: user.address,
        nonce: challenge.nonce,
        message: forged,
        signature: signText(forged, user),
      })
    )
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('refuses a signature by another key and another address with 401', async () => {
    const other = wallet()
    const challenge = await challengeFor(user.address)
    const res = await verifyRoute.POST(
      post('verify', {
        address: other.address,
        nonce: challenge.nonce,
        signature: signText(challenge.message, other),
      })
    )
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('refuses a malformed signature with 401, without echoing the message', async () => {
    const challenge = await challengeFor(user.address)
    const res = await verifyRoute.POST(
      post('verify', {
        address: user.address,
        nonce: challenge.nonce,
        signature: 'not base64',
      })
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain(challenge.nonce)
    expect(JSON.stringify(body)).not.toContain('wants you to sign in')
  })

  it('requires address, nonce and signature as strings', async () => {
    for (const [body, error] of [
      [{}, 'address is required'],
      [{ address: user.address }, 'nonce is required'],
      [{ address: user.address, nonce: 'abc' }, 'signature is required'],
      [
        { address: user.address, nonce: 'abc', signature: 64 },
        'signature is required',
      ],
      [null, 'address is required'],
    ] as const) {
      const res = await verifyRoute.POST(post('verify', body))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error })
    }
  })

  it('refuses the cross-site text/plain form post that plants a session', async () => {
    const res = await verifyRoute.POST(
      request('verify', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
          'content-type': 'text/plain',
        },
        body: '{"address":"x","nonce":"y","signature":"z"}',
      })
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(limiter.limit).not.toHaveBeenCalled()
  })

  it('answers 429 with Retry-After once the limit is spent', async () => {
    limiter.limit.mockImplementationOnce(async () => ({
      success: false,
      retryAfter: 7,
    }))
    const res = await verifyRoute.POST(post('verify', {}))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('7')
  })
})

describe('session route', () => {
  async function signIn(): Promise<string> {
    const challenge = await challengeFor(user.address)
    const res = await verifyRoute.POST(
      post('verify', {
        address: user.address,
        nonce: challenge.nonce,
        signature: signText(challenge.message, user),
      })
    )
    const token = sessionCookie(res)
    if (!token) throw new Error('no session cookie')
    return token
  }

  const withCookie = (method: string, token: string) =>
    request('session', {
      method,
      headers: { origin: SITE, cookie: `solana_session=${token}` },
    })

  it('reads the session back, then signs out and revokes it', async () => {
    const token = await signIn()

    const read = await sessionRoute.GET(withCookie('GET', token))
    expect(read.status).toBe(200)
    expect((await read.json()).session.address).toBe(user.address)

    const out = await sessionRoute.DELETE(withCookie('DELETE', token))
    expect(out.status).toBe(200)
    expect(out.headers.get('set-cookie')).toMatch(/solana_session=;/)
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/i)

    const after = await sessionRoute.GET(withCookie('GET', token))
    expect(after.status).toBe(401)
  })

  it('answers 401 without a cookie or with a Stellar-shaped one', async () => {
    const none = await sessionRoute.GET(request('session', { method: 'GET' }))
    expect(none.status).toBe(401)
    expect(await none.json()).toEqual({ error: 'solana session is missing' })

    const bad = await sessionRoute.GET(withCookie('GET', 'abc.def'))
    expect(bad.status).toBe(401)
    expect(await bad.json()).toEqual({
      error: 'solana session is invalid or expired',
    })
  })

  it('refuses a cross-site sign-out', async () => {
    const res = await sessionRoute.DELETE(
      request('session', {
        method: 'DELETE',
        headers: { origin: 'https://evil.example' },
      })
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
