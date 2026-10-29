import { base58, base64 } from '@scure/base'
import { createPublicKey, randomBytes, verify } from 'node:crypto'

import { isSolanaAddress } from '@/lib/wallet/address'

import {
  openSessionToken,
  sealSessionToken,
  sessionSecretKey,
} from './session-token'
import { allowedDomains } from './sign-in-domains'
import {
  consumeSiwsChallenge,
  rememberSiwsChallenge,
} from './solana-challenge-store'

/**
 * Sign-In With Solana, server side.
 *
 * The server builds the SIWS message (EIP-4361 layout) and keeps it under its
 * nonce; the wallet signs those bytes with `solana:signMessage`; verification
 * takes the message back out of the store by nonce — once: the first attempt
 * burns it, whatever its outcome — and checks the ed25519 signature over
 * exactly those bytes against the key the base58 address encodes. Text sent
 * back by the client is never verified, so nothing is parsed server-side.
 */

const CHALLENGE_TIMEOUT_SECONDS = 5 * 60
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

/** SIWS `Chain ID`: LendWise signs in on mainnet-beta everywhere. */
export const SIWS_CHAIN_ID = 'mainnet'
/** The chain a Solana session belongs to (Wallet Standard chain id). */
export const SOLANA_SESSION_CHAIN = 'solana:mainnet'
export const SIWS_STATEMENT =
  'Sign in to LendWise with this Solana account. Signing sends no transaction and costs no fee.'

// 16 random bytes, hex: EIP-4361 nonces are alphanumeric, 8 characters or more.
const NONCE_RE = /^[0-9a-f]{32}$/
const SIGNATURE_BYTES = 64
// Padded base64 of 64 bytes.
const SIGNATURE_BASE64_LENGTH = 88
// DER SubjectPublicKeyInfo header of an Ed25519 key; the raw 32 bytes follow.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

// The y-coordinates of the ed25519 points of small order (libsodium's
// blocklist): 0, 1, the order-8 pair, p − 1, and the non-canonical p and
// p + 1. Node's verify accepts signatures anyone can forge under such a key
// (R = identity, S = 0 under the identity), so nobody owns such an address.
const P = 2n ** 255n - 19n
const Y_ORDER_8 =
  2707385501144840649318225287225658788936804267575313519463743609750303402022n
const SMALL_ORDER_Y = new Set([
  0n,
  1n,
  Y_ORDER_8,
  P - Y_ORDER_8,
  P - 1n,
  P,
  P + 1n,
])

function hasSmallOrder(key: Uint8Array): boolean {
  // Little-endian y; the top bit is the sign of x, ignored here.
  let y = 0n
  for (let i = key.length - 1; i >= 0; i--) {
    y = (y << 8n) | BigInt(i === key.length - 1 ? key[i] & 0x7f : key[i])
  }
  return SMALL_ORDER_Y.has(y)
}

/** A refused sign-in: the message is safe to show the caller. */
export class SolanaSignInError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SolanaSignInError'
  }
}

export interface SolanaSessionPayload {
  // Session ID, used to revoke the session on sign-out.
  sid: string
  address: string
  chain: typeof SOLANA_SESSION_CHAIN
  issuedAt: number
  expiresAt: number
}

export interface SolanaChallengePayload {
  address: string
  nonce: string
  /** The exact text to sign: its UTF-8 bytes go to `solana:signMessage`. */
  message: string
  domain: string
  uri: string
  issuedAt: string
  expiresAt: string
}

export function buildSiwsMessage({
  domain,
  uri,
  address,
  nonce,
  issuedAt,
  expirationTime,
}: {
  domain: string
  uri: string
  address: string
  nonce: string
  issuedAt: string
  expirationTime: string
}): string {
  return [
    `${domain} wants you to sign in with your Solana account:`,
    address,
    '',
    SIWS_STATEMENT,
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Chain ID: ${SIWS_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join('\n')
}

/**
 * Whether `signature` (base64 of the 64 bytes `solana:signMessage` returns) is
 * the ed25519 signature of `message`'s UTF-8 bytes by the key `address`
 * encodes. Never throws: any malformed input is simply not a valid signature,
 * and neither is any signature under a small-order key.
 */
export function verifySiwsSignature(
  message: string,
  signature: string,
  address: string
): boolean {
  if (typeof signature !== 'string') return false
  if (signature.length !== SIGNATURE_BASE64_LENGTH) return false
  if (!isSolanaAddress(address)) return false
  try {
    const sig = base64.decode(signature)
    // Canonical encoding only: one signature, one string.
    if (sig.length !== SIGNATURE_BYTES || base64.encode(sig) !== signature)
      return false
    const raw = base58.decode(address)
    if (hasSmallOrder(raw)) return false
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, Buffer.from(message, 'utf8'), key, sig)
  } catch {
    return false
  }
}

/**
 * The EIP-4361 domain and URI of a sign-in, from the origin the request
 * reached (`request.nextUrl.origin`), never from the request body. Like
 * SEP-10's home domain, the host is only trusted when it is one of this
 * deployment's own (sign-in-domains.ts): otherwise a phishing server could
 * forge `Host: evil.example` and obtain a message naming its own domain,
 * which a wallet would then show as legitimate on its page.
 */
function signInOrigin(origin: string): { domain: string; uri: string } {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw new SolanaSignInError('Host is not an allowed sign-in domain')
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    !allowedDomains().has(url.hostname.toLowerCase())
  ) {
    throw new SolanaSignInError('Host is not an allowed sign-in domain')
  }
  // `host` keeps a non-default port (localhost:3000), as EIP-4361 asks.
  return { domain: url.host, uri: url.origin }
}

export async function issueSolanaChallenge({
  address,
  origin,
}: {
  address: string
  origin: string
}): Promise<SolanaChallengePayload> {
  if (!isSolanaAddress(address)) {
    throw new SolanaSignInError('Invalid Solana address')
  }
  const { domain, uri } = signInOrigin(origin)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + CHALLENGE_TIMEOUT_SECONDS
  const nonce = randomBytes(16).toString('hex')
  const issuedAt = new Date(now * 1000).toISOString()
  const expirationTime = new Date(expiresAt * 1000).toISOString()
  const message = buildSiwsMessage({
    domain,
    uri,
    address,
    nonce,
    issuedAt,
    expirationTime,
  })

  await rememberSiwsChallenge(nonce, { address, domain, message, expiresAt })

  return {
    address,
    nonce,
    message,
    domain,
    uri,
    issuedAt,
    expiresAt: expirationTime,
  }
}

function sessionKey(): Buffer {
  return sessionSecretKey('solana-session-v1', 'solana-session-dev-v1')
}

export function signSolanaSession(payload: SolanaSessionPayload): string {
  return sealSessionToken(payload, sessionKey())
}

export function verifySolanaSessionToken(
  token: string
): SolanaSessionPayload | null {
  let key: Buffer
  try {
    key = sessionKey()
  } catch {
    return null
  }
  const payload = openSessionToken(
    token,
    key
  ) as Partial<SolanaSessionPayload> | null
  if (!payload || typeof payload !== 'object') return null
  if (typeof payload.sid !== 'string' || payload.sid.length < 16) return null
  if (typeof payload.address !== 'string') return null
  if (!isSolanaAddress(payload.address)) return null
  if (payload.chain !== SOLANA_SESSION_CHAIN) return null
  if (typeof payload.issuedAt !== 'number') return null
  if (typeof payload.expiresAt !== 'number') return null
  if (payload.expiresAt <= Math.floor(Date.now() / 1000)) return null
  return {
    sid: payload.sid,
    address: payload.address,
    chain: payload.chain,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  }
}

export async function verifySolanaChallenge({
  address,
  nonce,
  signature,
  origin,
}: {
  address: string
  nonce: string
  signature: string
  origin: string
}): Promise<{ session: SolanaSessionPayload; token: string }> {
  if (typeof nonce !== 'string' || !NONCE_RE.test(nonce)) {
    throw new SolanaSignInError('Challenge nonce is malformed')
  }

  // Taken out of the store before anything else is checked: whatever this
  // attempt's outcome, the nonce cannot be tried again.
  const challenge = await consumeSiwsChallenge(nonce)
  if (!challenge) {
    throw new SolanaSignInError('Challenge is unknown, expired or already used')
  }

  const now = Math.floor(Date.now() / 1000)
  if (now >= challenge.expiresAt) {
    throw new SolanaSignInError('Challenge has expired')
  }
  const { domain } = signInOrigin(origin)
  if (challenge.domain !== domain) {
    throw new SolanaSignInError('Challenge was issued for another domain')
  }
  if (address !== challenge.address) {
    throw new SolanaSignInError('Challenge was issued for another address')
  }
  if (!verifySiwsSignature(challenge.message, signature, challenge.address)) {
    throw new SolanaSignInError('Signature does not match the challenge')
  }

  const session: SolanaSessionPayload = {
    sid: randomBytes(18).toString('base64url'),
    address: challenge.address,
    chain: SOLANA_SESSION_CHAIN,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  }
  return { session, token: signSolanaSession(session) }
}
