import { Redis } from '@upstash/redis'

const PREFIX = 'lw:sep10:challenge:'
const localChallenges = new Map<string, number>()
let redis: Redis | null | undefined

function getRedis(): Redis | null {
  if (redis !== undefined) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  redis = url && token ? new Redis({ url, token }) : null
  return redis
}

function pruneLocal(now = Math.floor(Date.now() / 1000)): void {
  for (const [hash, expiresAt] of localChallenges) {
    if (expiresAt <= now) localChallenges.delete(hash)
  }
}

export async function rememberSep10Challenge({
  hash,
  expiresAt,
}: {
  hash: string
  expiresAt: number
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const ttl = Math.max(1, expiresAt - now)
  pruneLocal(now)
  localChallenges.set(hash, expiresAt)

  const store = getRedis()
  if (!store) return

  const result = await store.set(PREFIX + hash, '1', { ex: ttl, nx: true })
  if (result !== 'OK') {
    throw new Error('SEP-10 challenge nonce already exists')
  }
}

export async function consumeSep10Challenge(hash: string): Promise<boolean> {
  pruneLocal()
  const store = getRedis()
  if (store) {
    const key = PREFIX + hash
    const existing = await store.get<string>(key)
    if (!existing) return false
    await store.del(key)
    return true
  }

  const expiresAt = localChallenges.get(hash)
  if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000)) {
    localChallenges.delete(hash)
    return false
  }
  localChallenges.delete(hash)
  return true
}
