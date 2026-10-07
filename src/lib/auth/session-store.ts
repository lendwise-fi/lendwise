import { requireSharedStore } from './redis'

const REVOKED_PREFIX = 'lw:sep10:revoked:'

const localRevoked = new Map<string, number>()

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

// Records a session ID as revoked until the session would have expired.
export async function revokeStellarSession(
  sid: string,
  expiresAt: number
): Promise<void> {
  const ttl = Math.max(1, expiresAt - nowSeconds())
  const store = requireSharedStore()
  if (store) {
    await store.set(REVOKED_PREFIX + sid, '1', { ex: ttl })
    return
  }
  localRevoked.set(sid, expiresAt)
}

export async function isStellarSessionRevoked(sid: string): Promise<boolean> {
  const store = requireSharedStore()
  if (store) {
    return (await store.exists(REVOKED_PREFIX + sid)) === 1
  }
  const expiresAt = localRevoked.get(sid)
  if (expiresAt === undefined) return false
  if (expiresAt <= nowSeconds()) {
    localRevoked.delete(sid)
    return false
  }
  return true
}

// Test helper: clears in-memory state between cases.
export function resetLocalSessionStore(): void {
  localRevoked.clear()
}
