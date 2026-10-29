import { createHmac, timingSafeEqual } from 'crypto'

import { isProduction } from './redis'

/**
 * The HMAC key of a wallet session cookie, derived from the session secret
 * with a label per sign-in: a token minted for one sign-in never verifies as
 * another's. Never the SEP-10 signing key itself. Production requires the
 * dedicated secret, `STELLAR_SESSION_SECRET` (named after the first sign-in
 * it served; it keys the Solana session too). Outside production, the SEP-10
 * signing secret stands in, under a dev label.
 */
export function sessionSecretKey(label: string, devLabel: string): Buffer {
  const configured = process.env.STELLAR_SESSION_SECRET
  if (configured) {
    return createHmac('sha256', configured).update(label).digest()
  }
  if (isProduction()) {
    throw new Error('STELLAR_SESSION_SECRET is not configured')
  }
  const signing = process.env.STELLAR_SEP10_SIGNING_SECRET
  if (!signing) throw new Error('STELLAR_SESSION_SECRET is not configured')
  return createHmac('sha256', signing).update(devLabel).digest()
}

/** `base64url(JSON) + '.' + base64url(HMAC-SHA256(key, body))`. */
export function sealSessionToken(payload: object, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  )
  const sig = createHmac('sha256', key).update(body).digest('base64url')
  return body + '.' + sig
}

/**
 * The parsed body of a token whose HMAC matches `key`, or null. The caller
 * still checks the payload's shape and expiry.
 */
export function openSessionToken(token: string, key: Buffer): unknown {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', key).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}
