import 'server-only'

import { cookies } from 'next/headers'

import {
  isSolanaSessionRevoked,
  isStellarSessionRevoked,
} from './session-store'
import { verifySolanaSessionToken } from './solana-siws'
import { verifySessionToken } from './stellar-sep10'

export const STELLAR_SESSION_COOKIE = 'stellar_session'
export const SOLANA_SESSION_COOKIE = 'solana_session'

export type StellarSessionErrorCode =
  'missing' | 'invalid' | 'revoked' | 'address-mismatch' | 'rate-limited'

export class StellarSessionError extends Error {
  constructor(readonly code: StellarSessionErrorCode) {
    super(`Stellar session ${code}`)
    this.name = 'StellarSessionError'
  }
}

export interface ActiveStellarSession {
  address: string
  sid: string
  expiresAt: number
}

async function sessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(STELLAR_SESSION_COOKIE)?.value
}

async function solanaSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(SOLANA_SESSION_COOKIE)?.value
}

/**
 * The SEP-10 session behind a server action: signed by us, not expired, on
 * this deployment's network (verifySessionToken checks the passphrase), and
 * not revoked by a sign-out. Route handlers read the cookie themselves; server
 * actions call this.
 */
export async function requireStellarSession(
  deps: { cookie?: () => Promise<string | undefined> } = {}
): Promise<ActiveStellarSession> {
  const token = await (deps.cookie ?? sessionCookie)()
  if (!token) throw new StellarSessionError('missing')
  const session = verifySessionToken(token)
  if (!session) throw new StellarSessionError('invalid')
  if (await isStellarSessionRevoked(session.sid)) {
    throw new StellarSessionError('revoked')
  }
  return {
    address: session.address,
    sid: session.sid,
    expiresAt: session.expiresAt,
  }
}

export function assertSessionAddress(
  session: ActiveStellarSession,
  address: string
): void {
  if (session.address !== address) {
    throw new StellarSessionError('address-mismatch')
  }
}

export type SolanaSessionErrorCode = StellarSessionErrorCode

export class SolanaSessionError extends Error {
  constructor(readonly code: SolanaSessionErrorCode) {
    super(`Solana session ${code}`)
    this.name = 'SolanaSessionError'
  }
}

export interface ActiveSolanaSession {
  address: string
  sid: string
  expiresAt: number
}

/**
 * The Sign-In With Solana session behind a server action: signed by us, not
 * expired, for Solana mainnet (verifySolanaSessionToken checks the chain), and
 * not revoked by a sign-out. The Solana twin of `requireStellarSession`.
 */
export async function requireSolanaSession(
  deps: { cookie?: () => Promise<string | undefined> } = {}
): Promise<ActiveSolanaSession> {
  const token = await (deps.cookie ?? solanaSessionCookie)()
  if (!token) throw new SolanaSessionError('missing')
  const session = verifySolanaSessionToken(token)
  if (!session) throw new SolanaSessionError('invalid')
  if (await isSolanaSessionRevoked(session.sid)) {
    throw new SolanaSessionError('revoked')
  }
  return {
    address: session.address,
    sid: session.sid,
    expiresAt: session.expiresAt,
  }
}

/** Base58 addresses are compared exactly: case is part of the key. */
export function assertSolanaSessionAddress(
  session: ActiveSolanaSession,
  address: string
): void {
  if (session.address !== address) {
    throw new SolanaSessionError('address-mismatch')
  }
}
