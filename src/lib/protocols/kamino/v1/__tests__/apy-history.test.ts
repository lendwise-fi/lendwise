import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BorrowMarketState, SupplyMarketState } from '@/lib/db/types'
import type {
  HistoryDataPoint,
  HistoryFailure,
} from '@/lib/protocols/core/types'
import type { HistoryTarget } from '@/lib/protocols/core/types'

import marketsMetadata from '../../__tests__/fixtures/markets-metadata.json'
import markets from '../../__tests__/fixtures/markets.json'
import dailyLegacy from '../../__tests__/fixtures/reserve-history-daily-legacy.json'
import hourly from '../../__tests__/fixtures/reserve-history-hourly.json'
import reserveStats from '../../__tests__/fixtures/reserve-stats.json'
import { adapter } from '../index'
import { buildProductId } from '../utils'

const PRIMARY = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
const USDC = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'
const STRONGSOL = 'A2J2CEwmwa9aTKbEfNoik6YTyNep9GtvNjU65okWYhwn'
const ADRASOL = '64AZMUHLB6NYvQSt41JTer4v8NAFDCz5sUPb7dYpCxa'

const SUPPLY = buildProductId(PRIMARY, USDC, 'supply')
const BORROW = buildProductId(PRIMARY, USDC, 'borrow')

const T0 = Date.parse('2026-10-28T00:00:00.000Z') / 1000
const T_END = Date.parse('2026-10-28T23:00:00.000Z') / 1000

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

function historyFor(reserve: string, body: unknown = hourly) {
  return json({ ...(body as object), reserve })
}

function install(
  historyHandler: (reserve: string, url: URL) => Response = (r) => historyFor(r)
) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/v2/kamino-market') return json(markets)
    if (url.pathname === '/reserves/batch/stats') return json(reserveStats)
    if (url.pathname === '/markets/batch/metadata') return json(marketsMetadata)
    const m = url.pathname.match(
      /^\/kamino-market\/([^/]+)\/reserves\/([^/]+)\/metrics\/history$/
    )
    if (m) return historyHandler(m[2], url)
    return new Response('not found', { status: 404 })
  })
}

function historyCalls(): URL[] {
  return fetchMock.mock.calls
    .map(([i]) => new URL(String(i)))
    .filter((u) => u.pathname.endsWith('/metrics/history'))
}

function target(
  kind: 'supply' | 'borrow',
  reserve = USDC,
  market = PRIMARY
): HistoryTarget {
  return {
    productId: buildProductId(market, reserve, kind),
    chainId: -2,
    kind,
    meta: { market, reserve, mint: 'm', marketName: 'x', symbol: 'USDC' },
  }
}

type Res = { points: HistoryDataPoint[]; failures: HistoryFailure[] }
type Loose = { history: { metrics: Record<string, unknown> }[] }

const base = {
  startTimestamp: T0,
  endTimestamp: T_END,
  interval: 'HOUR' as const,
}

afterEach(() => {
  fetchMock.mockReset()
})

describe('getApyHistory', () => {
  it('is wired on the adapter', () => {
    expect(typeof adapter.getApyHistory).toBe('function')
  })

  it('fetches one reserve once for a supply and a borrow target', async () => {
    install()
    const res = await adapter.getApyHistory!({
      ...base,
      targets: [target('supply'), target('borrow')],
    })
    const calls = historyCalls()
    expect(calls).toHaveLength(1)
    // no enumeration when targets carry the identifiers
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(calls[0].searchParams.get('frequency')).toBe('hour')
    expect(calls[0].searchParams.get('start')).toBe('2026-10-28T00:00:00.000Z')
    expect(calls[0].searchParams.get('end')).toBe('2026-10-28T23:00:00.000Z')
    const r = Array.isArray(res) ? { points: res, failures: [] } : res
    expect(r.failures).toEqual([])
    expect(r.points.filter((p) => p.kind === 'supply')).toHaveLength(24)
    expect(r.points.filter((p) => p.kind === 'borrow')).toHaveLength(24)
  })

  it('maps a day interval to the daily frequency', async () => {
    install()
    await adapter.getApyHistory!({
      ...base,
      interval: 'DAY',
      targets: [target('supply')],
    })
    expect(historyCalls()[0].searchParams.get('frequency')).toBe('day')
  })

  it('maps rates and market state for supply and borrow points', async () => {
    install()
    const res = (await adapter.getApyHistory!({
      ...base,
      targets: [target('supply'), target('borrow')],
    })) as Res
    const s = res.points.find((p) => p.kind === 'supply')!
    const b = res.points.find((p) => p.kind === 'borrow')!
    expect(s.productId).toBe(SUPPLY)
    expect(b.productId).toBe(BORROW)
    expect(s.timestamp).toEqual(new Date('2026-10-28T00:00:00.000Z'))
    expect(s.apy).toEqual({
      base: 0.12914717951772242,
      rewards: 0,
      fees: 0,
      net: 0.12914717951772242,
      rewardItems: [],
    })
    expect(b.apy).toEqual({
      base: 0.15541302708152044,
      rewards: 0,
      fees: 0,
      net: 0.15541302708152044,
      rewardItems: [],
    })
    const sm = s.market as SupplyMarketState
    expect(sm.supplyAssetsUsd).toBeCloseTo(130102706.45347)
    expect(sm.supplyAssets).toBeCloseTo(130141832.65494)
    expect(sm.assetPriceUsd).toBeCloseTo(0.9997086)
    expect(sm.utilizationRate).toBeCloseTo(119967249.67668909 / 130141832.65494)
    const bm = b.market as BorrowMarketState
    expect(bm.borrowAssetsUsd).toBeCloseTo(119931201.79322)
    expect(bm.borrowAssets).toBeCloseTo(119967249.676689)
    expect(bm.supplyAssetsUsd).toBeCloseTo(130102706.45347)
    expect(bm.collateralAssetsUsd).toBeNull()
    expect(bm.priceCollateralInLoanAsset).toBeNull()
  })

  it('adds rewards on supply and subtracts them on borrow, null counting as 0', async () => {
    const body = structuredClone(hourly) as typeof hourly
    body.history[0].metrics.supplyRewardsApy = '0.02'
    body.history[0].metrics.borrowRewardsApy = '0.01'
    body.history[1].metrics.supplyRewardsApy = null as never
    install((r) => historyFor(r, body))
    const res = (await adapter.getApyHistory!({
      ...base,
      targets: [target('supply'), target('borrow')],
    })) as Res
    const s0 = res.points.find(
      (p) => p.kind === 'supply' && p.timestamp.getTime() === T0 * 1000
    )!
    expect(s0.apy.rewards).toBeCloseTo(0.02)
    expect(s0.apy.net).toBeCloseTo(0.12914717951772242 + 0.02)
    const b0 = res.points.find(
      (p) => p.kind === 'borrow' && p.timestamp.getTime() === T0 * 1000
    )!
    expect(b0.apy.rewards).toBeCloseTo(0.01)
    expect(b0.apy.net).toBeCloseTo(0.15541302708152044 - 0.01)
    const s1 = res.points.find(
      (p) => p.kind === 'supply' && p.timestamp.getTime() === (T0 + 3600) * 1000
    )!
    expect(s1.apy.rewards).toBe(0)
  })

  it('reads legacy daily rows (loanToValuePct, null rewards) without inventing zeros', async () => {
    install((r) => historyFor(r, dailyLegacy))
    const start = Date.parse('2023-10-12T00:00:00.000Z') / 1000
    const res = (await adapter.getApyHistory!({
      startTimestamp: start,
      endTimestamp: start + 3 * 86400,
      interval: 'DAY',
      targets: [target('supply')],
    })) as Res
    expect(res.failures).toEqual([])
    expect(res.points).toHaveLength(3)
    expect(res.points[0].apy.rewards).toBe(0)
    expect(res.points[0].apy.base).toBeCloseTo(0.011288690685390157)
    expect(
      (res.points[0].market as SupplyMarketState).supplyAssetsUsd
    ).toBeCloseTo(5227.27371742898)
  })

  it('leaves market state null (never 0) when the API omits it', async () => {
    const body = structuredClone(hourly) as unknown as Loose
    for (const row of body.history) {
      row.metrics.depositTvl = null
      row.metrics.borrowTvl = null
      row.metrics.totalSupply = null
      row.metrics.totalBorrows = null
      row.metrics.assetPriceUSD = null
    }
    install((r) => historyFor(r, body))
    const res = (await adapter.getApyHistory!({
      ...base,
      targets: [target('supply'), target('borrow')],
    })) as Res
    for (const p of res.points) {
      expect((p.market as SupplyMarketState).supplyAssets).toBeNull()
      expect((p.market as SupplyMarketState).supplyAssetsUsd).toBeNull()
      expect((p.market as SupplyMarketState).utilizationRate).toBeNull()
      expect((p.market as SupplyMarketState).assetPriceUsd).toBeNull()
      if (p.kind === 'borrow') {
        expect((p.market as BorrowMarketState).borrowAssets).toBeNull()
        expect((p.market as BorrowMarketState).borrowAssetsUsd).toBeNull()
      }
    }
  })

  it('converts the window from seconds to milliseconds and keeps both bounds', async () => {
    install()
    const res = (await adapter.getApyHistory!({
      ...base,
      startTimestamp: T0 + 3600,
      endTimestamp: T0 + 3 * 3600,
      targets: [target('supply')],
    })) as Res
    const ts = res.points.map((p) => p.timestamp.getTime() / 1000)
    expect(ts).toEqual([T0 + 3600, T0 + 7200, T0 + 10800])
    expect(historyCalls()[0].searchParams.get('start')).toBe(
      '2026-10-28T01:00:00.000Z'
    )
  })

  it('names a requested product that returns nothing', async () => {
    install((r) => json({ reserve: r, history: [] }))
    const res = (await adapter.getApyHistory!({
      ...base,
      targets: [target('supply'), target('borrow')],
    })) as Res
    expect(res.points).toEqual([])
    expect(res.failures.map((f) => f.productId).sort()).toEqual(
      [SUPPLY, BORROW].sort()
    )
    expect(res.failures[0].reason).toMatch(/no history/)
  })

  it('names the products of a reserve whose request fails and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    install((r) =>
      r === STRONGSOL ? new Response('boom', { status: 500 }) : historyFor(r)
    )
    const res = (await adapter.getApyHistory!({
      ...base,
      targets: [target('supply'), target('supply', STRONGSOL)],
    })) as Res
    expect(res.points.every((p) => p.productId === SUPPLY)).toBe(true)
    expect(res.points).toHaveLength(24)
    expect(res.failures).toHaveLength(1)
    expect(res.failures[0].productId).toBe(
      buildProductId(PRIMARY, STRONGSOL, 'supply')
    )
    warn.mockRestore()
  })

  it('enumerates for productIds alone, fetching only the requested reserves', async () => {
    install()
    const res = (await adapter.getApyHistory!({
      ...base,
      productIds: [SUPPLY, BORROW],
    })) as Res
    expect(historyCalls()).toHaveLength(1)
    expect(res.failures).toEqual([])
    expect(res.points).toHaveLength(48)
  })

  it('reports a productId absent from the catalogue as a failure', async () => {
    install()
    const ghost = buildProductId(PRIMARY, 'Ghost1111', 'supply')
    const res = (await adapter.getApyHistory!({
      ...base,
      productIds: [SUPPLY, ghost],
    })) as Res
    expect(res.failures).toEqual([
      { productId: ghost, reason: expect.stringMatching(/catalogue/) },
    ])
    expect(historyCalls()).toHaveLength(1)
  })

  it('reports a borrow productId on a collateral-only reserve as a failure', async () => {
    install()
    const id = buildProductId(PRIMARY, ADRASOL, 'borrow')
    const res = (await adapter.getApyHistory!({
      ...base,
      productIds: [id],
    })) as Res
    expect(res.failures.map((f) => f.productId)).toEqual([id])
    expect(historyCalls()).toHaveLength(0)
  })

  it('covers the whole listing when nothing is requested', async () => {
    install()
    const res = (await adapter.getApyHistory!(base)) as Res
    // 3 listed reserves (USDC, strongSOL, adraSOL), 1 borrowable
    expect(historyCalls()).toHaveLength(3)
    expect(new Set(res.points.map((p) => p.productId)).size).toBe(4)
  })

  it('returns nothing, without any call, when chainIds excludes Solana', async () => {
    install()
    const res = await adapter.getApyHistory!({
      ...base,
      chainIds: [1],
      targets: [target('supply')],
    })
    expect(res).toEqual({ points: [], failures: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports progress', async () => {
    install()
    const onProgress = vi.fn()
    await adapter.getApyHistory!({
      ...base,
      targets: [target('supply')],
      onProgress,
    })
    expect(onProgress).toHaveBeenCalled()
  })
})
