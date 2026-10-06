import { cookies } from 'next/headers'

import { isStellarSessionRevoked } from './session-store'
import { type StellarSessionPayload, verifySessionToken } from './stellar-sep10'

export const STELLAR_SESSION_COOKIE = 'stellar_session'

// Reads the session from the cookie and checks it is valid and not revoked.
export async function currentStellarSession(): Promise<StellarSessionPayload | null> {
  const token = (await cookies()).get(STELLAR_SESSION_COOKIE)?.value
  const session = token ? verifySessionToken(token) : null
  if (!session) return null
  if (await isStellarSessionRevoked(session.sid)) return null
  return session
}

// Server actions that act on a Stellar account call this first. The session
// is the SEP-10 proof that the caller controls that account.
export async function requireStellarSession(): Promise<StellarSessionPayload> {
  const session = await currentStellarSession()
  if (!session) {
    throw new Error('Stellar sign-in required')
  }
  return session
}

// Ensures an account named in an action is the one the caller signed in with.
export function assertSessionAddress(
  session: StellarSessionPayload,
  address: string
): void {
  if (session.address !== address) {
    throw new Error('Stellar address does not match the signed-in account')
  }
}
