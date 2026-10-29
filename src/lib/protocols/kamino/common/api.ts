import type { ZodType } from 'zod'

import {
  KAMINO_API_URL,
  KAMINO_ENV,
  KAMINO_HISTORY_CHUNK_MS,
  KAMINO_MAX_MARKETS_PER_CALL,
  KAMINO_REQUEST_TIMEOUT_MS,
  type KaminoHistoryFrequency,
} from './config'
import {
  type KaminoMarket,
  type KaminoObligation,
  type KaminoReserveHistoryPoint,
  type KaminoReserveStatsBody,
  marketsMetadataResponseSchema,
  marketsResponseSchema,
  obligationsResponseSchema,
  reserveHistoryResponseSchema,
  reserveStatsResponseSchema,
} from './schemas'

export type {
  KaminoMarket,
  KaminoObligation,
  KaminoReserveHistoryPoint,
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

async function request<T>(
  path: string,
  params: Record<string, string>,
  schema: ZodType<T>
): Promise<T> {
  const url = new URL(path, KAMINO_API_URL)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(KAMINO_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new KaminoApiError(
        'timeout',
        path,
        `no response within ${KAMINO_REQUEST_TIMEOUT_MS} ms`
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

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

/** All lending markets (`/v2/kamino-market`). Addresses keep their base58 case. */
export function fetchMarkets(): Promise<KaminoMarket[]> {
  return request('/v2/kamino-market', {}, marketsResponseSchema)
}

/**
 * Spot stats of every reserve of the given markets, in batches of up to 100
 * markets. `/reserves/batch/stats` is keyed by reserve and carries no market,
 * so each batch is paired with `/markets/batch/metadata` (market -> reserves)
 * to tag every reserve with its market.
 */
export async function fetchReserveStats(
  markets: readonly string[]
): Promise<KaminoReserveStats[]> {
  const out: KaminoReserveStats[] = []
  for (const batch of chunk(
    [...new Set(markets)],
    KAMINO_MAX_MARKETS_PER_CALL
  )) {
    const market = batch.join(',')
    const [stats, metadata] = await Promise.all([
      request('/reserves/batch/stats', { market }, reserveStatsResponseSchema),
      request(
        '/markets/batch/metadata',
        { market },
        marketsMetadataResponseSchema
      ),
    ])
    for (const [marketAddress, { reserves }] of Object.entries(metadata)) {
      for (const reserve of reserves) {
        const body = stats[reserve]
        if (body) out.push({ ...body, market: marketAddress, reserve })
      }
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
    for (const point of history) byTimestamp.set(point.timestamp, point)
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/** Obligations of `wallet` in `market` (empty when the wallet has none). */
export function fetchObligations(
  market: string,
  wallet: string
): Promise<KaminoObligation[]> {
  return request(
    `/kamino-market/${market}/users/${wallet}/obligations`,
    { env: KAMINO_ENV },
    obligationsResponseSchema
  )
}
