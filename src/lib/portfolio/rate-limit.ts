import type { LimitResult } from '@/lib/ratelimit'

import type { PortfolioRateLimited } from './types'

/** The optimizer's 429 message, for the same situation. */
export const PORTFOLIO_RATE_LIMIT_MESSAGE =
  'Rate limit exceeded. Retry shortly.'

/**
 * Runs `load` unless the caller's IP is over its budget, in which case the
 * load is not started and the rate-limit shape is returned: a server action
 * has no status code, so the refusal is a value, never a throw. A limiter that
 * fails (or an IP that cannot be read) lets the load through, like every
 * limiter here: availability outranks enforcement.
 */
export async function limitPortfolioLoad<T>(deps: {
  ip: () => Promise<string>
  limit: (ip: string) => Promise<LimitResult>
  load: () => Promise<T>
}): Promise<T | PortfolioRateLimited> {
  let verdict: LimitResult
  try {
    verdict = await deps.limit(await deps.ip())
  } catch (error) {
    console.error(
      '[ratelimit] portfolio limit check failed, failing open:',
      error
    )
    return deps.load()
  }
  if (!verdict.success) {
    return {
      error: PORTFOLIO_RATE_LIMIT_MESSAGE,
      retryAfter: verdict.retryAfter,
    }
  }
  return deps.load()
}
