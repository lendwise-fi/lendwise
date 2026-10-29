export const KAMINO_PROVIDER = 'kamino'

/** Public Kamino REST API (no key, no SDK). */
export const KAMINO_API_URL = 'https://api.kamino.finance'

/** Solana cluster passed as `env` to the `/kamino-market/...` endpoints. */
export const KAMINO_ENV = 'mainnet-beta'

/** Per-request timeout in milliseconds. */
export const KAMINO_REQUEST_TIMEOUT_MS = 20_000

/** `/reserves/batch/stats` and `/markets/batch/metadata` accept up to 100 markets per call. */
export const KAMINO_MAX_MARKETS_PER_CALL = 100

export type KaminoHistoryFrequency = 'hour' | 'day'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Span of one `metrics/history` request. A full hourly series is large (~23 MB
 * since 2025), so `fetchReserveHistory` splits `[start, end]` into chunks of
 * this size and concatenates them. Hourly chunks stay under the API's 32-day
 * hourly default window.
 */
export const KAMINO_HISTORY_CHUNK_MS: Record<KaminoHistoryFrequency, number> = {
  hour: 30 * DAY_MS,
  day: 365 * DAY_MS,
}

/** `/reserves/account-data` returns ~11 KB per reserve: markets per call. */
export const KAMINO_ACCOUNT_DATA_MARKETS_PER_CALL = 10

/**
 * Reward token mint -> symbol, for the reward mints seen in batch stats
 * (2026-10-29). Sources: Kamino `/reserves/metrics` (liquidityToken of the
 * reserve with that mint) for USDG, USDC, JTO, BONK, lanternSOL, strongSOL;
 * Jupiter token API (lite-api.jup.ag/tokens/v2/search) and DexScreener for
 * BLZE (Blaze), which is no Kamino reserve.
 */
export const KAMINO_REWARD_SYMBOLS: Readonly<Record<string, string>> = {
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH': 'USDG',
  BLZEEuZUBVqFhj8adcCFPJvPVCiCyVmh3hkJMrU8KuJA: 'BLZE',
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  LnTRntk2kTfWEY6cVB8K9649pgJbt6dJLS1Ns1GZCWg: 'lanternSOL',
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: 'JTO',
  strng7mqqc1MBJJV6vMzYbEqnwVGvKKGKedeCvtktWA: 'strongSOL',
}

/**
 * Reserves whose history is fetched at the same time by `getApyHistory`.
 * Kamino publishes no rate limit, so this stays small; each reserve already
 * issues its chunks one after the other.
 */
export const KAMINO_HISTORY_CONCURRENCY = 3
