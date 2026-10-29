import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  KaminoApiError,
  fetchMarkets,
  fetchObligations,
  fetchReserveAccounts,
  fetchReserveHistory,
  fetchReserveStats,
} from '../common/api'
import {
  KAMINO_API_URL,
  KAMINO_HISTORY_CHUNK_MS,
  KAMINO_MAX_MARKETS_PER_CALL,
} from '../common/config'
import marketsMetadata from './fixtures/markets-metadata.json'
import markets from './fixtures/markets.json'
// Recorded obligation; its address and owner are synthetic (sha256 of a
// label, base58), its market, reserves and amounts are real.
import obligations from './fixtures/obligations.json'
import historyDaily from './fixtures/reserve-history-daily-legacy.json'
import historyHourly from './fixtures/reserve-history-hourly.json'
import reserveStats from './fixtures/reserve-stats.json'
import accountData from './fixtures/reserves-account-data.json'

const PRIMARY = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
const FIXED_MARKET = '47tfyEG9SsdEnUm9cw5kY9BXngQGqu3LBoop9j5uTAv8'
const USDC_RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'
const HIDDEN = '4eUxuaHSHNTftaui3XVW32d2Ph2hKBLpuMP25gQ5MqF4'
const OBSOLETE = '5YpGenXaAowj4HS33AvirVb8P4tgue7S7YaY6MyYZ7LD'
const FIXED = '8Lvi1DFPoAGPQ25qpRKzzRaSAnWdeVZqt9XmEapm8uLt'
const REWARDED = 'A2J2CEwmwa9aTKbEfNoik6YTyNep9GtvNjU65okWYhwn'

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

function calledUrls(): URL[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input)))
}

afterEach(() => {
  fetchMock.mockReset()
})

describe('fetchMarkets', () => {
  it('parses /v2/kamino-market and keeps base58 case', async () => {
    fetchMock.mockResolvedValue(jsonResponse(markets))

    const result = await fetchMarkets()

    expect(calledUrls()[0].href).toBe(`${KAMINO_API_URL}/v2/kamino-market`)
    expect(result).toHaveLength(2)
    expect(result.find((m) => m.address === PRIMARY)).toMatchObject({
      name: 'SOL/BTC Market',
      isPrimary: true,
      isCurated: false,
    })
  })
})

describe('fetchReserveStats', () => {
  function mockStats() {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      return jsonResponse(
        url.pathname === '/reserves/batch/stats'
          ? reserveStats
          : marketsMetadata
      )
    })
  }

  it('tags every reserve with its market and converts numeric strings', async () => {
    mockStats()

    const result = await fetchReserveStats([PRIMARY, FIXED_MARKET])
    const byReserve = new Map(result.map((r) => [r.reserve, r]))

    expect(result).toHaveLength(7)
    const usdc = byReserve.get(USDC_RESERVE)!
    expect(usdc.market).toBe(PRIMARY)
    expect(usdc.status).toBe('Active')
    expect(usdc.rateType).toBe('variable')
    expect(typeof usdc.supplyApy).toBe('number')
    expect(usdc.supplyApyBreakdown.lending).toBeCloseTo(
      Number(reserveStats[USDC_RESERVE].supplyApyBreakdown.lending)
    )
    expect(usdc.totalSupplyUsd).toBeCloseTo(
      Number(reserveStats[USDC_RESERVE].totalSupplyUsd)
    )
    expect(usdc.maxLtv).toBe(Number(reserveStats[USDC_RESERVE].maxLTV))
    expect(byReserve.get(FIXED)!.market).toBe(FIXED_MARKET)
  })

  it('exposes status, fixed-rate term and reward APYs', async () => {
    mockStats()

    const byReserve = new Map(
      (await fetchReserveStats([PRIMARY, FIXED_MARKET])).map((r) => [
        r.reserve,
        r,
      ])
    )

    expect(byReserve.get(HIDDEN)!.status).toBe('Hidden')
    expect(byReserve.get(OBSOLETE)!.status).toBe('Obsolete')
    const fixed = byReserve.get(FIXED)!
    expect(fixed.rateType).toBe('fixed')
    expect(fixed.fixedTerm).toEqual({
      termSeconds: 2592000,
      apy: Number(reserveStats[FIXED].fixedTerm.apy),
    })
    expect(byReserve.get(USDC_RESERVE)!.fixedTerm).toBeNull()
    const rewarded = byReserve.get(REWARDED)!
    expect(rewarded.supplyRewards).toHaveLength(1)
    expect(rewarded.supplyRewards[0].apy).toBeCloseTo(
      Number(reserveStats[REWARDED].supplyRewardApys[0].apy)
    )
    expect(byReserve.get(USDC_RESERVE)!.supplyRewards).toEqual([])
  })

  it('sends markets comma-separated and in batches of 100', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}))
    const many = Array.from({ length: 250 }, (_, i) => `Market${i}`)

    await fetchReserveStats(many)

    const statsCalls = calledUrls().filter(
      (u) => u.pathname === '/reserves/batch/stats'
    )
    const sizes = statsCalls.map(
      (u) => u.searchParams.get('market')!.split(',').length
    )
    expect(sizes).toEqual([
      KAMINO_MAX_MARKETS_PER_CALL,
      KAMINO_MAX_MARKETS_PER_CALL,
      50,
    ])
  })

  it('skips a malformed reserve, warns, and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const partial = {
      ...reserveStats,
      [USDC_RESERVE]: {
        ...reserveStats[USDC_RESERVE],
        supplyApy: { current: 'abc' },
      },
    }
    fetchMock.mockImplementation(async (input) =>
      jsonResponse(
        new URL(String(input)).pathname === '/reserves/batch/stats'
          ? partial
          : marketsMetadata
      )
    )

    const result = await fetchReserveStats([PRIMARY, FIXED_MARKET])

    expect(result).toHaveLength(6)
    expect(result.map((r) => r.reserve)).not.toContain(USDC_RESERVE)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(USDC_RESERVE))
    warn.mockRestore()
  })

  it('rejects a body that is not an object', async () => {
    fetchMock.mockResolvedValue(jsonResponse([1, 2]))

    await expect(fetchReserveStats([PRIMARY])).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })

  it('tags batch 2 reserves with batch 2 markets and drops reserves absent from metadata', async () => {
    const many = Array.from({ length: 101 }, (_, i) => `Market${i}`)
    const stat = reserveStats[USDC_RESERVE]
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      const requested = url.searchParams.get('market')!.split(',')
      const isFirst = requested.length === 100
      if (url.pathname === '/reserves/batch/stats') {
        return jsonResponse(isFirst ? { R1: stat, ORPHAN: stat } : { R2: stat })
      }
      return jsonResponse(
        isFirst
          ? { Market0: { reserves: ['R1'] } }
          : { Market100: { reserves: ['R2'] } }
      )
    })

    const result = await fetchReserveStats(many)

    expect(result.map((r) => [r.market, r.reserve])).toEqual([
      ['Market0', 'R1'],
      ['Market100', 'R2'],
    ])
  })
})

describe('fetchReserveAccounts', () => {
  it('decodes mint, decimals and symbol, repeating the markets param in batches', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(accountData))
    const many = Array.from({ length: 11 }, (_, i) => `M${i}`)

    const result = await fetchReserveAccounts(many)

    const urls = calledUrls()
    expect(urls).toHaveLength(2)
    expect(urls[0].pathname).toBe('/kamino-market/reserves/account-data')
    expect(urls[0].searchParams.getAll('markets')).toHaveLength(10)
    expect(urls[1].searchParams.getAll('markets')).toEqual(['M10'])
    expect(urls[0].searchParams.get('env')).toBe('mainnet-beta')
    const usdc = result.find((a) => a.reserve === USDC_RESERVE)
    expect(usdc).toMatchObject({
      market: PRIMARY,
      reserve: USDC_RESERVE,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      symbol: 'USDC',
    })
    expect(result.find((a) => a.symbol === 'strongSOL')?.decimals).toBe(9)
  })

  it('decodes the risk config and the rates that convert obligation amounts', async () => {
    fetchMock.mockResolvedValue(jsonResponse(accountData))

    const result = await fetchReserveAccounts([PRIMARY])

    // Same values as /reserves/batch/stats (maxLTV 0.8, liqLTV 0.9,
    // borrowFactor 1) and an independent decode of the same bytes.
    const usdc = result.find((a) => a.reserve === USDC_RESERVE)
    expect(usdc).toMatchObject({
      maxLtv: 0.8,
      liquidationThreshold: 0.9,
      borrowFactor: 1,
      elevationGroups: [1, 3, 6, 8],
    })
    expect(usdc?.liquidityPerCToken).toBeCloseTo(1.2079418585535433, 12)
    expect(usdc?.cumulativeBorrowRate).toBeCloseTo(1.3067757536014906, 12)
    const strong = result.find((a) => a.symbol === 'strongSOL')
    expect(strong).toMatchObject({
      liquidationThreshold: 0.55,
      borrowFactor: 1.25,
      elevationGroups: [2],
    })
  })

  it('skips an undecodable account with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          market: PRIMARY,
          reserves: [
            ...accountData[0].reserves,
            { pubkey: 'BAD', data: 'AAAA' },
          ],
        },
      ])
    )
    const result = await fetchReserveAccounts([PRIMARY])
    expect(result).toHaveLength(3)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('rejects when a batch fails or the body has the wrong shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nope: true }))
    await expect(fetchReserveAccounts([PRIMARY])).rejects.toMatchObject({
      kind: 'invalid-response',
    })
    fetchMock.mockResolvedValue(
      new Response('x', { status: 500, statusText: 'Boom' })
    )
    await expect(fetchReserveAccounts([PRIMARY])).rejects.toMatchObject({
      kind: 'http',
      status: 500,
    })
  })
})

describe('fetchReserveHistory', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('parses 24 hourly rows with numbers and a ms timestamp', async () => {
    fetchMock.mockResolvedValue(jsonResponse(historyHourly))
    const start = Date.parse('2026-10-28T00:00:00Z')

    const rows = await fetchReserveHistory({
      market: PRIMARY,
      reserve: USDC_RESERVE,
      start,
      end: start + DAY,
      frequency: 'hour',
    })

    expect(rows).toHaveLength(24)
    expect(rows[0].timestamp).toBe(start)
    expect(rows[0]).toMatchObject({
      symbol: 'USDC',
      supplyApy: historyHourly.history[0].metrics.supplyInterestAPY,
      ltv: 0.8,
    })
    expect(typeof rows[0].assetPriceUsd).toBe('number')
    const url = calledUrls()[0]
    expect(url.pathname).toBe(
      `/kamino-market/${PRIMARY}/reserves/${USDC_RESERVE}/metrics/history`
    )
    expect(url.searchParams.get('env')).toBe('mainnet-beta')
    expect(url.searchParams.get('frequency')).toBe('hour')
    expect(url.searchParams.get('start')).toBe('2026-10-28T00:00:00.000Z')
    expect(url.searchParams.get('end')).toBe('2026-10-29T00:00:00.000Z')
  })

  it('reads the legacy loanToValuePct field as ltv', async () => {
    fetchMock.mockResolvedValue(jsonResponse(historyDaily))

    const rows = await fetchReserveHistory({
      market: PRIMARY,
      reserve: USDC_RESERVE,
      start: Date.parse('2023-10-12T00:00:00Z'),
      end: Date.parse('2023-10-15T00:00:00Z'),
      frequency: 'day',
    })

    expect(rows.map((r) => r.ltv)).toEqual([0.75, 0.75, 0.75])
    expect(rows[0].supplyRewardsApy).toBeNull()
  })

  it('splits the range into chunks, concatenates them and de-duplicates', async () => {
    const chunkMs = KAMINO_HISTORY_CHUNK_MS.hour
    const start = Date.parse('2026-01-01T00:00:00Z')
    const end = start + 2.5 * chunkMs
    const row = (t: number) => ({
      timestamp: new Date(t).toISOString(),
      metrics: { supplyInterestAPY: 0.1, borrowInterestAPY: 0.2 },
    })
    const seen: URL[] = []
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      seen.push(url)
      const from = Date.parse(url.searchParams.get('start')!)
      const to = Date.parse(url.searchParams.get('end')!)
      // The boundary row is returned by both neighbouring chunks.
      return jsonResponse({ history: [row(from), row(to)] })
    })

    const rows = await fetchReserveHistory({
      market: PRIMARY,
      reserve: USDC_RESERVE,
      start,
      end,
      frequency: 'hour',
    })

    expect(seen).toHaveLength(3)
    expect(seen.map((u) => u.searchParams.get('start'))).toEqual([
      new Date(start).toISOString(),
      new Date(start + chunkMs).toISOString(),
      new Date(start + 2 * chunkMs).toISOString(),
    ])
    expect(seen[2].searchParams.get('end')).toBe(new Date(end).toISOString())
    expect(rows.map((r) => r.timestamp)).toEqual([
      start,
      start + chunkMs,
      start + 2 * chunkMs,
      end,
    ])
  })

  it('skips a malformed history row and keeps the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rows = [
      ...historyHourly.history.slice(0, 2),
      { timestamp: 'not a date', metrics: {} },
    ]
    fetchMock.mockResolvedValue(jsonResponse({ history: rows }))

    const result = await fetchReserveHistory({
      market: PRIMARY,
      reserve: USDC_RESERVE,
      start: Date.parse('2026-10-28T00:00:00Z'),
      end: Date.parse('2026-10-28T03:00:00Z'),
      frequency: 'hour',
    })

    expect(result).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('returns nothing and calls nothing for an empty range', async () => {
    const rows = await fetchReserveHistory({
      market: PRIMARY,
      reserve: USDC_RESERVE,
      start: 1000,
      end: 1000,
      frequency: 'day',
    })

    expect(rows).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fetchObligations', () => {
  it('parses the obligation, drops empty slots and converts scaled fractions', async () => {
    fetchMock.mockResolvedValue(jsonResponse(obligations))

    const result = await fetchObligations(PRIMARY, 'WalletAddr1')

    const url = calledUrls()[0]
    expect(url.pathname).toBe(
      `/kamino-market/${PRIMARY}/users/WalletAddr1/obligations`
    )
    expect(url.searchParams.get('env')).toBe('mainnet-beta')
    expect(result).toHaveLength(1)
    const [obligation] = result
    expect(obligation.market).toBe(PRIMARY)
    expect(obligation.humanTag).toBe('Multiply')
    expect(obligation.deposits).toHaveLength(1)
    expect(obligation.deposits[0].amount).toBe('5740682')
    expect(obligation.deposits[0].marketValueUsd).toBeCloseTo(0.5636, 3)
    expect(obligation.borrows).toHaveLength(1)
    expect(obligation.borrows[0].marketValueUsd).toBeCloseTo(0.1299, 3)
    expect(obligation.stats?.loanToValue).toBeCloseTo(0.2333, 3)
    expect(obligation.stats?.userTotalDeposit).toBeCloseTo(0.6775, 3)
  })

  it('skips an obligation with a non-integer scaled fraction instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = structuredClone(obligations[0])
    bad.state.deposits[0].marketValueSf = 1.5 as unknown as string
    fetchMock.mockResolvedValue(jsonResponse([bad, obligations[0]]))

    const result = await fetchObligations(PRIMARY, 'WalletAddr1')

    expect(result).toHaveLength(1)
    vi.restoreAllMocks()
  })

  it('returns an empty list when the wallet has no obligation', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))

    await expect(fetchObligations(PRIMARY, 'WalletAddr1')).resolves.toEqual([])
  })

  it('keeps the debt cumulative borrow rate and the market elevation groups', async () => {
    const withMarket = structuredClone(obligations[0]) as Record<
      string,
      unknown
    >
    withMarket.market = {
      address: PRIMARY,
      state: {
        elevationGroups: [
          { id: 2, ltvPct: 87, liquidationThresholdPct: 92 },
          { id: 0, ltvPct: 0, liquidationThresholdPct: 0 },
          'garbage',
        ],
      },
    }
    fetchMock.mockResolvedValue(jsonResponse([withMarket, obligations[0]]))

    const [full, bare] = await fetchObligations(PRIMARY, 'WalletAddr1')

    // value[0] / 2^60, the low limb first.
    expect(full.borrows[0].cumulativeBorrowRate).toBeCloseTo(1.1697965, 6)
    expect(full.borrows[0].amountSf).toBe('1736446294425523242990594')
    expect(full.elevationGroups).toEqual([
      { id: 2, ltv: 0.87, liquidationThreshold: 0.92 },
    ])
    expect(bare.elevationGroups).toEqual([])
  })

  it('escapes the market and wallet path segments, case kept', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))

    await fetchObligations('Mkt/1', 'Wa?l#Let')

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/kamino-market/Mkt%2F1/users/Wa%3Fl%23Let/obligations?env=mainnet-beta'
    )
  })

  it('keeps an obligation whose refreshed ratio is NaN (no collateral value)', async () => {
    // Seen live: a deposit in a reserve with max LTV 0 makes loanToValue 0/0.
    const noCollateral = structuredClone(obligations[0])
    noCollateral.refreshedStats.loanToValue = 'NaN'
    fetchMock.mockResolvedValue(jsonResponse([noCollateral]))

    const [obligation] = await fetchObligations(PRIMARY, 'WalletAddr1', {
      strict: true,
    })

    expect(obligation.stats?.loanToValue).toBeNull()
    expect(obligation.stats?.userTotalDeposit).toBeCloseTo(0.6775, 3)
  })

  it('rejects a malformed obligation in strict mode instead of skipping it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValue(
      jsonResponse([{ obligationAddress: 'broken' }, obligations[0]])
    )

    await expect(
      fetchObligations(PRIMARY, 'WalletAddr1', { strict: true })
    ).rejects.toMatchObject({ kind: 'invalid-response' })
    warn.mockRestore()
  })

  it('applies a per-call timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    fetchMock.mockResolvedValue(jsonResponse([]))

    await fetchObligations(PRIMARY, 'WalletAddr1', { timeoutMs: 1234 })

    expect(timeout).toHaveBeenCalledWith(1234)
    timeout.mockRestore()
  })
})

describe('error normalization', () => {
  it('wraps a non-2xx response as an http KaminoApiError', async () => {
    fetchMock.mockResolvedValue(
      new Response('slow down', {
        status: 429,
        statusText: 'Too Many Requests',
      })
    )

    const error = await fetchMarkets().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(KaminoApiError)
    expect(error).toMatchObject({
      kind: 'http',
      status: 429,
      path: '/v2/kamino-market',
    })
    expect((error as Error).message).toContain('429')
  })

  it('wraps a timeout as a timeout KaminoApiError and passes a signal', async () => {
    fetchMock.mockRejectedValue(
      new DOMException('The operation timed out.', 'TimeoutError')
    )

    await expect(fetchMarkets()).rejects.toMatchObject({
      name: 'KaminoApiError',
      kind: 'timeout',
      status: null,
    })
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('wraps a fetch rejection as a network KaminoApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    await expect(fetchMarkets()).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('fetch failed'),
    })
  })

  it('flags a non-JSON body and a wrong shape as invalid-response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
    await expect(fetchMarkets()).rejects.toMatchObject({
      kind: 'invalid-response',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ not: 'an array' }))
    await expect(fetchMarkets()).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })
})
