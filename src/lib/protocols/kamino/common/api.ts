import type { ZodType } from 'zod'

import {
  KAMINO_ACCOUNT_DATA_MARKETS_PER_CALL,
  KAMINO_API_URL,
  KAMINO_ENV,
  KAMINO_HISTORY_CHUNK_MS,
  KAMINO_MAX_MARKETS_PER_CALL,
  KAMINO_REQUEST_TIMEOUT_MS,
  type KaminoHistoryFrequency,
} from './config'
import { decodeReserveAccount } from './reserve-account'
import {
  type KaminoMarket,
  type KaminoObligation,
  type KaminoReserveAccount,
  type KaminoReserveHistoryPoint,
  type KaminoReserveStatsBody,
  historyRowSchema,
  marketsMetadataResponseSchema,
  marketsResponseSchema,
  obligationSchema,
  obligationsResponseSchema,
  reserveAccountItemSchema,
  reserveAccountsResponseSchema,
  reserveHistoryResponseSchema,
  reserveStatsResponseSchema,
  reserveStatsSchema,
} from './schemas'

export type {
  KaminoMarket,
  KaminoObligation,
  KaminoReserveHistoryPoint,
  KaminoReserveAccount,
} from './schemas'

/** Reserve spot stats, tagged with the market it belongs to. */
export type KaminoReserveStats = KaminoReserveStatsBody & {
  market: string
  reserve: string
}

/**
 * Normalized failure of a Kamino API call. `kind` tells callers what to do:
 * `http` (non-2xx, see `status`), `timeout`, `network` (fetch rejected),
 * `invalid-response` (not JSON, or does not match the expected shape).
 */
export class KaminoApiError extends Error {
  readonly kind: 'http' | 'timeout' | 'network' | 'invalid-response'
  readonly status: number | null
  readonly path: string

  constructor(
    kind: KaminoApiError['kind'],
    path: string,
    message: string,
    status: number | null = null
  ) {
    super(`[kamino] ${path}: ${message}`)
    this.name = 'KaminoApiError'
    this.kind = kind
    this.path = path
    this.status = status
  }
}

/**
 * `timeoutMs` bounds this call; `signal` is the caller's own deadline: once it
 * aborts, the call is not issued (or is cut) and rejects as `timeout`.
 */
export interface KaminoRequestOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

async function request<T>(
  path: string,
  params: Record<string, string | readonly string[]>,
  schema: ZodType<T>,
  opts: KaminoRequestOptions = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? KAMINO_REQUEST_TIMEOUT_MS
  if (opts.signal?.aborted) {
    throw new KaminoApiError(
      'timeout',
      path,
      "aborted at the caller's deadline"
    )
  }
  const url = new URL(path, KAMINO_API_URL)
  for (const [key, value] of Object.entries(params)) {
    for (const v of typeof value === 'string' ? [value] : value) {
      url.searchParams.append(key, v)
    }
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: opts.signal
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), opts.signal])
        : AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (opts.signal?.aborted) {
      throw new KaminoApiError(
        'timeout',
        path,
        "aborted at the caller's deadline"
      )
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new KaminoApiError(
        'timeout',
        path,
        `no response within ${timeoutMs} ms`
      )
    }
    throw new KaminoApiError(
      'network',
      path,
      error instanceof Error ? error.message : String(error)
    )
  }

  if (!response.ok) {
    throw new KaminoApiError(
      'http',
      path,
      `HTTP ${response.status} ${response.statusText}`.trim(),
      response.status
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new KaminoApiError('invalid-response', path, 'body is not JSON')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new KaminoApiError(
      'invalid-response',
      path,
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
    )
  }
  return parsed.data
}

/**
 * Parses each item on its own: a malformed item is skipped (not fatal) and
 * reported in one `console.warn` with the count and the first few ids, so one
 * bad reserve, row or obligation cannot take the rest of the payload down.
 * `strict` rejects instead, for callers that must not show a partial answer
 * as complete.
 */
function parseEach<T>(
  path: string,
  items: readonly (readonly [string, unknown])[],
  schema: ZodType<T>,
  opts: { strict?: boolean } = {}
): (readonly [string, T])[] {
  const out: (readonly [string, T])[] = []
  const skipped: string[] = []
  for (const [id, raw] of items) {
    const parsed = schema.safeParse(raw)
    if (parsed.success) out.push([id, parsed.data] as const)
    else skipped.push(id)
  }
  if (skipped.length > 0 && opts.strict) {
    throw new KaminoApiError(
      'invalid-response',
      path,
      `${skipped.length} malformed item(s): ${skipped.slice(0, 5).join(', ')}`
    )
  }
  if (skipped.length > 0) {
    console.warn(
      `[kamino] ${path}: skipped ${skipped.length} malformed item(s): ${skipped.slice(0, 5).join(', ')}`
    )
  }
  return out
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

/** All lending markets (`/v2/kamino-market`). Addresses keep their base58 case. */
export function fetchMarkets(
  opts: KaminoRequestOptions = {}
): Promise<KaminoMarket[]> {
  return request('/v2/kamino-market', {}, marketsResponseSchema, opts)
}

/**
 * Spot stats of every reserve of the given markets, in batches of up to 100
 * markets. `/reserves/batch/stats` is keyed by reserve and carries no market,
 * so each batch is paired with `/markets/batch/metadata` (market -> reserves)
 * to tag every reserve with its market.
 */
export async function fetchReserveStats(
  markets: readonly string[],
  opts: KaminoRequestOptions = {}
): Promise<KaminoReserveStats[]> {
  const out: KaminoReserveStats[] = []
  for (const batch of chunk(
    [...new Set(markets)],
    KAMINO_MAX_MARKETS_PER_CALL
  )) {
    const market = batch.join(',')
    const [stats, metadata] = await Promise.all([
      request(
        '/reserves/batch/stats',
        { market },
        reserveStatsResponseSchema,
        opts
      ),
      request(
        '/markets/batch/metadata',
        { market },
        marketsMetadataResponseSchema,
        opts
      ),
    ])
    const path = '/reserves/batch/stats'
    for (const [marketAddress, { reserves }] of Object.entries(metadata)) {
      const wanted = reserves.filter((r) => r in stats)
      const parsed = parseEach(
        path,
        wanted.map((r) => [r, stats[r]] as const),
        reserveStatsSchema
      )
      for (const [reserve, body] of parsed) {
        out.push({ ...body, market: marketAddress, reserve })
      }
    }
  }
  return out
}

/**
 * Mint, decimals and symbol of every reserve of the given markets, decoded from
 * the on-chain Reserve accounts (`/reserves/account-data`, `markets` repeated,
 * batches of `KAMINO_ACCOUNT_DATA_MARKETS_PER_CALL`). A failing batch throws:
 * the catalogue must not treat a partial read as a delisting. An account that
 * cannot be decoded is skipped with a warning.
 */
export async function fetchReserveAccounts(
  markets: readonly string[],
  opts: KaminoRequestOptions = {}
): Promise<KaminoReserveAccount[]> {
  const path = '/kamino-market/reserves/account-data'
  const out: KaminoReserveAccount[] = []
  for (const batch of chunk(
    [...new Set(markets)],
    KAMINO_ACCOUNT_DATA_MARKETS_PER_CALL
  )) {
    const raw = await request(
      path,
      { markets: batch, env: KAMINO_ENV },
      reserveAccountsResponseSchema,
      opts
    )
    for (const entry of raw) {
      const items = parseEach(
        path,
        entry.reserves.map((r, i) => [String(i), r] as const),
        reserveAccountItemSchema
      )
      const decoded: [string, KaminoReserveAccount][] = []
      const failed: string[] = []
      for (const [, item] of items) {
        try {
          decoded.push([
            item.pubkey,
            {
              market: entry.market,
              reserve: item.pubkey,
              ...decodeReserveAccount(item.data),
            },
          ])
        } catch {
          failed.push(item.pubkey)
        }
      }
      if (failed.length > 0) {
        console.warn(
          `[kamino] ${path}: skipped ${failed.length} undecodable account(s): ${failed.slice(0, 5).join(', ')}`
        )
      }
      for (const [, account] of decoded) out.push(account)
    }
  }
  return out
}

/**
 * Metrics history of one reserve over `[start, end]` (epoch ms), oldest first.
 * The range is split into `KAMINO_HISTORY_CHUNK_MS[frequency]` requests which
 * run one after the other; rows are de-duplicated by timestamp.
 */
export async function fetchReserveHistory(params: {
  market: string
  reserve: string
  start: number
  end: number
  frequency: KaminoHistoryFrequency
}): Promise<KaminoReserveHistoryPoint[]> {
  const { market, reserve, start, end, frequency } = params
  const span = KAMINO_HISTORY_CHUNK_MS[frequency]
  const path = `/kamino-market/${market}/reserves/${reserve}/metrics/history`
  const byTimestamp = new Map<number, KaminoReserveHistoryPoint>()

  for (let from = start; from < end; from += span) {
    const to = Math.min(from + span, end)
    const { history } = await request(
      path,
      {
        env: KAMINO_ENV,
        start: new Date(from).toISOString(),
        end: new Date(to).toISOString(),
        frequency,
      },
      reserveHistoryResponseSchema
    )
    const points = parseEach(
      path,
      history.map((row, i) => [String(i), row] as const),
      historyRowSchema
    )
    for (const [, point] of points) byTimestamp.set(point.timestamp, point)
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Obligations of `wallet` in `market` (empty when the wallet has none). Both
 * path segments are escaped; base58 case is kept. `strict` rejects the call
 * when any obligation is malformed (wallet positions: a hidden loan would
 * understate the risk); see `KaminoRequestOptions` for the time limits.
 */
export async function fetchObligations(
  market: string,
  wallet: string,
  opts: KaminoRequestOptions & { strict?: boolean } = {}
): Promise<KaminoObligation[]> {
  const path = `/kamino-market/${encodeURIComponent(market)}/users/${encodeURIComponent(wallet)}/obligations`
  const raw = await request(
    path,
    { env: KAMINO_ENV },
    obligationsResponseSchema,
    { timeoutMs: opts.timeoutMs, signal: opts.signal }
  )
  return parseEach(
    path,
    raw.map((o, i) => [String(i), o] as const),
    obligationSchema,
    { strict: opts.strict }
  ).map(([, o]) => o)
}
