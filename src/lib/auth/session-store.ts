import { requireSharedStore } from './redis'

const REVOKED_PREFIX = 'lw:sep10:revoked:'
const RATE_PREFIX = 'lw:rate:'

const localRevoked = new Map<string, number>()
const localRate = new Map<string, { count: number; resetAt: number }>()

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

// Fixed-window limiter. Returns false once `limit` calls are used in the window.
export async function allowRequest({
  key,
  limit,
  windowSeconds,
}: {
  key: string
  limit: number
  windowSeconds: number
}): Promise<boolean> {
  const store = requireSharedStore()
  if (store) {
    const count = await store.incr(RATE_PREFIX + key)
    if (count === 1) {
      await store.expire(RATE_PREFIX + key, windowSeconds)
    }
    return count <= limit
  }

  const now = nowSeconds()
  const current = localRate.get(key)
  if (!current || current.resetAt <= now) {
    localRate.set(key, { count: 1, resetAt: now + windowSeconds })
    return true
  }
  current.count += 1
  return current.count <= limit
}

// Test helper: clears in-memory state between cases.
export function resetLocalSessionStore(): void {
  localRevoked.clear()
  localRate.clear()
}
