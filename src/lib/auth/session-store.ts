import { requireSharedStore } from './redis'

// One revocation namespace per wallet sign-in: the Stellar prefix predates
// Solana and stays as it is, so revocations already in Redis still hold.
const REVOKED_PREFIX = {
  stellar: 'lw:sep10:revoked:',
  solana: 'lw:siws:revoked:',
} as const

type SessionFamily = keyof typeof REVOKED_PREFIX

// Keyed by prefix + sid, like Redis.
const localRevoked = new Map<string, number>()

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

// Records a session ID as revoked until the session would have expired.
async function revokeSession(
  family: SessionFamily,
  sid: string,
  expiresAt: number
): Promise<void> {
  const key = REVOKED_PREFIX[family] + sid
  const ttl = Math.max(1, expiresAt - nowSeconds())
  const store = requireSharedStore()
  if (store) {
    await store.set(key, '1', { ex: ttl })
    return
  }
  localRevoked.set(key, expiresAt)
}

async function isSessionRevoked(
  family: SessionFamily,
  sid: string
): Promise<boolean> {
  const key = REVOKED_PREFIX[family] + sid
  const store = requireSharedStore()
  if (store) {
    return (await store.exists(key)) === 1
  }
  const expiresAt = localRevoked.get(key)
  if (expiresAt === undefined) return false
  if (expiresAt <= nowSeconds()) {
    localRevoked.delete(key)
    return false
  }
  return true
}

export function revokeStellarSession(
  sid: string,
  expiresAt: number
): Promise<void> {
  return revokeSession('stellar', sid, expiresAt)
}

export function isStellarSessionRevoked(sid: string): Promise<boolean> {
  return isSessionRevoked('stellar', sid)
}

export function revokeSolanaSession(
  sid: string,
  expiresAt: number
): Promise<void> {
  return revokeSession('solana', sid, expiresAt)
}

export function isSolanaSessionRevoked(sid: string): Promise<boolean> {
  return isSessionRevoked('solana', sid)
}

// Test helper: clears in-memory state between cases.
export function resetLocalSessionStore(): void {
  localRevoked.clear()
}
