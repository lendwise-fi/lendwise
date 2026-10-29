import { base58 } from '@scure/base'
import { type KeyObject, generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetLocalSiwsChallenges } from './solana-challenge-store'
import {
  SIWS_STATEMENT,
  type SolanaSessionPayload,
  SolanaSignInError,
  buildSiwsMessage,
  issueSolanaChallenge,
  signSolanaSession,
  verifySiwsSignature,
  verifySolanaChallenge,
  verifySolanaSessionToken,
} from './solana-siws'
import { signSession, verifySessionToken } from './stellar-sep10'

const ORIGINAL_ENV = { ...process.env }
const ORIGIN = 'https://lendwise.fi'

interface Wallet {
  address: string
  privateKey: KeyObject
}

function wallet(): Wallet {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  // The raw 32-byte key ends the SPKI DER encoding.
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)
  return { address: base58.encode(raw), privateKey }
}

/** What a wallet returns for `solana:signMessage`, base64-encoded. */
function signText(text: string, signer: Wallet): string {
  return sign(null, Buffer.from(text, 'utf8'), signer.privateKey).toString(
    'base64'
  )
}

let user: Wallet

beforeEach(() => {
  user = wallet()
  process.env.STELLAR_SESSION_SECRET = 'test-session-secret'
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'lendwise.fi'
  resetLocalSiwsChallenges()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.useRealTimers()
})

async function signedChallenge(signer: Wallet = user) {
  const challenge = await issueSolanaChallenge({
    address: user.address,
    origin: ORIGIN,
  })
  return { challenge, signature: signText(challenge.message, signer) }
}

describe('buildSiwsMessage', () => {
  it('lays the fields out as Sign-In With Solana (EIP-4361) text', () => {
    const address = 'FcP2xWWnEybVnLmbf2HT9EXr7ynNpEZsrUb5QB9qZ1Bb'
    expect(
      buildSiwsMessage({
        domain: 'lendwise.fi',
        uri: 'https://lendwise.fi',
        address,
        nonce: '0123456789abcdef0123456789abcdef',
        issuedAt: '2030-01-01T00:00:00.000Z',
        expirationTime: '2030-01-01T00:05:00.000Z',
      })
    ).toBe(
      [
        'lendwise.fi wants you to sign in with your Solana account:',
        address,
        '',
        SIWS_STATEMENT,
        '',
        'URI: https://lendwise.fi',
        'Version: 1',
        'Chain ID: mainnet',
        'Nonce: 0123456789abcdef0123456789abcdef',
        'Issued At: 2030-01-01T00:00:00.000Z',
        'Expiration Time: 2030-01-01T00:05:00.000Z',
      ].join('\n')
    )
  })

  it('states in one English line that signing sends no transaction', () => {
    expect(SIWS_STATEMENT).not.toContain('\n')
    expect(SIWS_STATEMENT).toMatch(/LendWise/)
  })
})

describe('Solana challenge', () => {
  it('builds the message for the host the request reached, with a 5-minute expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const challenge = await issueSolanaChallenge({
      address: user.address,
      origin: ORIGIN,
    })

    expect(challenge.address).toBe(user.address)
    expect(challenge.domain).toBe('lendwise.fi')
    expect(challenge.uri).toBe('https://lendwise.fi')
    expect(challenge.issuedAt).toBe('2030-01-01T00:00:00.000Z')
    expect(challenge.expiresAt).toBe('2030-01-01T00:05:00.000Z')
    // EIP-4361 nonces are alphanumeric, at least 8 characters.
    expect(challenge.nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(challenge.message).toBe(
      buildSiwsMessage({
        domain: 'lendwise.fi',
        uri: 'https://lendwise.fi',
        address: user.address,
        nonce: challenge.nonce,
        issuedAt: challenge.issuedAt,
        expirationTime: challenge.expiresAt,
      })
    )
  })

  it('keeps the port of a local origin in the domain, as EIP-4361 asks', async () => {
    const challenge = await issueSolanaChallenge({
      address: user.address,
      origin: 'http://localhost:3000',
    })
    expect(challenge.domain).toBe('localhost:3000')
    expect(challenge.uri).toBe('http://localhost:3000')
    expect(challenge.message).toMatch(
      /^localhost:3000 wants you to sign in with your Solana account:\n/
    )
  })

  it('issues a fresh nonce for every challenge', async () => {
    const a = await issueSolanaChallenge({
      address: user.address,
      origin: ORIGIN,
    })
    const b = await issueSolanaChallenge({
      address: user.address,
      origin: ORIGIN,
    })
    expect(a.nonce).not.toBe(b.nonce)
  })

  it('refuses an address that is not a Solana public key', async () => {
    for (const address of [
      'not-a-key',
      '0' + user.address.slice(1), // '0' is not a base58 digit
      '0x' + 'a'.repeat(40),
      '1'.repeat(10_000),
    ]) {
      await expect(
        issueSolanaChallenge({ address, origin: ORIGIN })
      ).rejects.toThrow(SolanaSignInError)
    }
  })

  it('refuses a forged host that is not one of this deployment', async () => {
    await expect(
      issueSolanaChallenge({
        address: user.address,
        origin: 'https://evil.example',
      })
    ).rejects.toThrow('not an allowed sign-in domain')
    await expect(
      issueSolanaChallenge({
        address: user.address,
        origin: 'https://lendwise.fi.evil.example',
      })
    ).rejects.toThrow('not an allowed sign-in domain')
  })

  it('accepts the hosts Vercel sets and the extra sign-in hosts', async () => {
    process.env.VERCEL_URL = 'dashboard-abc123-smarttdev.vercel.app'
    process.env.STELLAR_SIGN_IN_EXTRA_HOSTS = 'lendwise-mainnet.vercel.app'
    for (const host of [
      'dashboard-abc123-smarttdev.vercel.app',
      'lendwise-mainnet.vercel.app',
    ]) {
      const challenge = await issueSolanaChallenge({
        address: user.address,
        origin: `https://${host}`,
      })
      expect(challenge.domain).toBe(host)
    }
  })
})

describe('verifySiwsSignature', () => {
  const message = 'lendwise.fi wants you to sign in with your Solana account:'

  it('accepts a signature by the address over the exact bytes', () => {
    expect(
      verifySiwsSignature(message, signText(message, user), user.address)
    ).toBe(true)
  })

  it('refuses a signature made by another key', () => {
    expect(
      verifySiwsSignature(message, signText(message, wallet()), user.address)
    ).toBe(false)
  })

  it('refuses a signature over a different message', () => {
    expect(
      verifySiwsSignature(message, signText(message + ' ', user), user.address)
    ).toBe(false)
  })

  it('refuses a malformed signature without throwing', () => {
    const good = signText(message, user)
    const bytes = Buffer.from(good, 'base64')
    for (const signature of [
      '',
      'not base64 at all',
      bytes.subarray(0, 63).toString('base64'), // 63 bytes
      Buffer.concat([bytes, Buffer.from([0])]).toString('base64'), // 65 bytes
      good.replace(/=+$/, ''), // unpadded
      bytes.toString('base64url'), // other alphabet
      ' ' + good.slice(1),
      base58.encode(bytes), // base58, not the agreed encoding
      'A'.repeat(100_000),
      Buffer.alloc(64).toString('base64'), // all-zero signature
    ]) {
      expect(verifySiwsSignature(message, signature, user.address)).toBe(false)
    }
  })

  it('refuses a malformed or off-curve address without throwing', () => {
    const signature = signText(message, user)
    for (const address of [
      '',
      'not-a-key',
      base58.encode(Buffer.alloc(32, 0xff)), // not an ed25519 point
      base58.encode(Buffer.alloc(31, 1)),
    ]) {
      expect(verifySiwsSignature(message, signature, address)).toBe(false)
    }
  })

  it('refuses every small-order key, which anyone can forge a signature for', () => {
    // Node's ed25519 verify accepts R = identity, S = 0 under the identity
    // key for any message, and under the other small-order keys for a share
    // of messages: nobody owns such an address, so it never signs in.
    const P = 2n ** 255n - 19n
    const Y8 =
      2707385501144840649318225287225658788936804267575313519463743609750303402022n
    const encode = (y: bigint, sign: number) => {
      const bytes = Buffer.alloc(32)
      for (let i = 0, v = y; i < 32; i++, v >>= 8n) {
        bytes[i] = Number(v & 0xffn)
      }
      bytes[31] |= sign << 7
      return bytes
    }
    const forged = Buffer.concat([encode(1n, 0), Buffer.alloc(32)]).toString(
      'base64'
    )
    for (const y of [0n, 1n, Y8, P - Y8, P - 1n, P, P + 1n]) {
      for (const sign of [0, 1]) {
        const address = base58.encode(encode(y, sign))
        for (let i = 0; i < 64; i++) {
          expect(verifySiwsSignature(`${message} ${i}`, forged, address)).toBe(
            false
          )
        }
      }
    }
  })
})

describe('Solana challenge verification', () => {
  it('accepts the signed challenge and issues a session for that address', async () => {
    const { challenge, signature } = await signedChallenge()
    const { session, token } = await verifySolanaChallenge({
      address: user.address,
      nonce: challenge.nonce,
      signature,
      origin: ORIGIN,
    })
    expect(session.address).toBe(user.address)
    expect(session.chain).toBe('solana:mainnet')
    expect(session.sid.length).toBeGreaterThanOrEqual(16)
    expect(session.expiresAt - session.issuedAt).toBe(7 * 24 * 60 * 60)
    expect(verifySolanaSessionToken(token)).toEqual(session)
  })

  it('refuses a replayed nonce', async () => {
    const { challenge, signature } = await signedChallenge()
    const attempt = () =>
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature,
        origin: ORIGIN,
      })
    await attempt()
    await expect(attempt()).rejects.toThrow('unknown, expired or already used')
  })

  it('burns the nonce on a failed attempt, so a later good signature is refused', async () => {
    const { challenge, signature } = await signedChallenge()
    await expect(
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature: signText(challenge.message, wallet()),
        origin: ORIGIN,
      })
    ).rejects.toThrow('Signature does not match')
    await expect(
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature,
        origin: ORIGIN,
      })
    ).rejects.toThrow('unknown, expired or already used')
  })

  it('refuses a signature made by another key', async () => {
    const { challenge, signature } = await signedChallenge(wallet())
    await expect(
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature,
        origin: ORIGIN,
      })
    ).rejects.toThrow('Signature does not match')
  })

  it('verifies over the stored message, never over text the client signed instead', async () => {
    const challenge = await issueSolanaChallenge({
      address: user.address,
      origin: ORIGIN,
    })
    // The client signs its own text (another domain, same nonce): the server
    // checks the signature against the message it kept, so it fails.
    const forged = challenge.message.replace(
      'lendwise.fi wants you',
      'evil.example wants you'
    )
    await expect(
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature: signText(forged, user),
        origin: ORIGIN,
      })
    ).rejects.toThrow('Signature does not match')
  })

  it('refuses an expired challenge, checked at verification time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const { challenge, signature } = await signedChallenge()

    // The store still holds the record (a Redis TTL rounds to the second);
    // the expiry written in the message is what decides.
    vi.setSystemTime(new Date('2030-01-01T00:05:00Z'))
    await expect(
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature,
        origin: ORIGIN,
      })
    ).rejects.toThrow('Challenge has expired')
  })

  it('accepts a challenge signed just before it expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const { challenge, signature } = await signedChallenge()

    vi.setSystemTime(new Date('2030-01-01T00:04:59Z'))
    const { session } = await verifySolanaChallenge({
      address: user.address,
      nonce: challenge.nonce,
      signature,
      origin: ORIGIN,
    })
    expect(session.address).toBe(user.address)
  })

  it('refuses an address other than the one the challenge was issued for', async () => {
    const other = wallet()
    const { challenge } = await signedChallenge()
    // The other key signs the challenged message and claims its own address.
    await expect(
      verifySolanaChallenge({
        address: other.address,
        nonce: challenge.nonce,
        signature: signText(challenge.message, other),
        origin: ORIGIN,
      })
    ).rejects.toThrow('another address')
  })

  it('refuses a challenge replayed on another of our hosts', async () => {
    const { challenge, signature } = await signedChallenge()
    process.env.VERCEL_URL = 'dashboard-abc123-smarttdev.vercel.app'
    await expect(
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature,
        origin: 'https://dashboard-abc123-smarttdev.vercel.app',
      })
    ).rejects.toThrow('another domain')
  })

  it('refuses verification on a forged host', async () => {
    const { challenge, signature } = await signedChallenge()
    await expect(
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature,
        origin: 'https://evil.example',
      })
    ).rejects.toThrow('not an allowed sign-in domain')
  })

  it('refuses a malformed nonce or signature with a sign-in error, not a crash', async () => {
    const { challenge } = await signedChallenge()
    for (const nonce of [
      '',
      'short',
      'x'.repeat(10_000),
      challenge.nonce.toUpperCase(),
    ]) {
      await expect(
        verifySolanaChallenge({
          address: user.address,
          nonce,
          signature: 'AAAA',
          origin: ORIGIN,
        })
      ).rejects.toThrow(SolanaSignInError)
    }
    await expect(
      verifySolanaChallenge({
        address: user.address,
        nonce: challenge.nonce,
        signature: 'not base64',
        origin: ORIGIN,
      })
    ).rejects.toThrow(SolanaSignInError)
  })
})

describe('Solana session token', () => {
  const now = () => Math.floor(Date.now() / 1000)
  const payload = (): SolanaSessionPayload => ({
    sid: 'sid-solana-test-0123',
    address: user.address,
    chain: 'solana:mainnet',
    issuedAt: now(),
    expiresAt: now() + 3600,
  })

  it('round-trips a signed session', () => {
    const p = payload()
    expect(verifySolanaSessionToken(signSolanaSession(p))).toEqual(p)
  })

  it('refuses a forged, expired or other-chain session', () => {
    const token = signSolanaSession(payload())
    expect(
      verifySolanaSessionToken(
        token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))
      )
    ).toBeNull()
    expect(
      verifySolanaSessionToken(
        signSolanaSession({ ...payload(), expiresAt: now() - 1 })
      )
    ).toBeNull()
    expect(
      verifySolanaSessionToken(
        signSolanaSession({
          ...payload(),
          chain: 'solana:devnet' as 'solana:mainnet',
        })
      )
    ).toBeNull()
  })

  it('never accepts a Stellar session token, nor the reverse', () => {
    process.env.STELLAR_SEP10_SIGNING_SECRET =
      'SBZVMB74Z76QZ3ZOY7UTDFYKMEGKW5XFJEB6PFKBF4UYSSWHG4EDH7PY'
    const stellar = signSession({
      sid: 'sid-stellar-test-0123',
      address: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
      issuedAt: now(),
      expiresAt: now() + 3600,
    })
    expect(verifySessionToken(stellar)).not.toBeNull()
    expect(verifySolanaSessionToken(stellar)).toBeNull()
    expect(verifySessionToken(signSolanaSession(payload()))).toBeNull()
  })

  it('refuses to sign in production without the session secret', () => {
    delete process.env.STELLAR_SESSION_SECRET
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() => signSolanaSession(payload())).toThrow(
        'STELLAR_SESSION_SECRET is not configured'
      )
      expect(verifySolanaSessionToken('anything.at-all')).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
