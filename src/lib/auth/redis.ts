import { Redis } from '@upstash/redis'

let client: Redis | null | undefined

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

// Returns the shared Redis client, or null when Upstash is not configured.
export function sharedRedis(): Redis | null {
  if (client !== undefined) return client
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  client = url && token ? new Redis({ url, token }) : null
  return client
}

// Auth state (challenges, revocations, rate limits) must be shared across
// instances in production. Local development may fall back to memory.
export function requireSharedStore(): Redis | null {
  const store = sharedRedis()
  if (!store && isProduction()) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production'
    )
  }
  return store
}
