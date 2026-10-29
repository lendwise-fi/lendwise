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
