import { afterEach, describe, expect, it, vi } from 'vitest'

import { computeRiskAccounts } from '@/lib/risk/compute'
import { calculateHealthFactor } from '@/lib/risk/health-factor'
import { type PriceMap, priceKeyId } from '@/lib/risk/types'

import recording from '../../__tests__/fixtures/positions-recording.json'
import {
  type KaminoObligation,
  type KaminoReserveAccount,
  type KaminoReserveStats,
} from '../../common/api'
import {
  KAMINO_MARKET_DATA_TTL_MS,
  KAMINO_OBLIGATIONS_TTL_MS,
  KAMINO_POSITIONS_CONCURRENCY,
  KAMINO_POSITIONS_MAX_WALLETS,
} from '../../common/config'
import { decodeReserveAccount } from '../../common/reserve-account'
import { obligationSchema, reserveStatsSchema } from '../../common/schemas'
import { assetPriceUsd } from '../apy-spot'
import {
  borrowPositionsFromReading,
  clearKaminoPositionsCache,
  kaminoPriceKey,
  loadKaminoReadings,
  positionsAdapter,
  readingFromObligation,
  riskAccountFromReading,
  supplyPositionsFromReading,
  weightsMatchStats,
} from '../positions'

vi.mock('@/lib/risk/prices', () => ({
  resolveRiskPrices: vi.fn(async () => new Map()),
}))

const MARKET = recording.market
const SOL = 'd4A2prbA2whesmvHaL88BH6Ewn5N4bTSU2Ze8P6Bc4Q'
const BSOL = 'H9vmCVd77N1HZa36eBn3UnftYmg4vQzPfm1RxabHAMER'
const USDC = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'
const WALLET_A = 'AKjdwZT5d1S9YA6NPYyBZ5jAUAXYVJaYAVCd38hJiKS4'
const WALLET_B = '8vWf48A4WLuwqKTg3VABfVsouvp6v1dAG3br3NU4Ufzs'
const EMODE = 'Bo2dqPtwcsiHNaEfu4YaH6ocuPCqm9W4EoWdJfg6oFum'
const LEVERAGE = 'ArwUhciGHRPaV9bMJXLqcUadyuMSr5MkNCc6Hy8mxAfY'
const NO_DEBT = 'CJGMmJ7vzBLGbpNNVxhTHPNdHXf9kFqQoBGJewkJ1PxF'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

const MARKETS_BODY = [
  {
    name: 'SOL/BTC Market',
    isPrimary: true,
    description: 'SOL/BTC Pool',
    lendingMarket: MARKET,
    lookupTable: 'FGMSBiyVE8TvZcdQnZETAAKw28tkQJ2ccZy6pyp95URb',
    isCurated: false,
  },
  {
    name: 'Empty Market',
    isPrimary: false,
    description: '',
    lendingMarket: 'DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek',
    lookupTable: 'FGMSBiyVE8TvZcdQnZETAAKw28tkQJ2ccZy6pyp95URb',
    isCurated: false,
  },
]

const obligationsOf = (wallet: string): unknown[] =>
  (recording.obligations as Record<string, unknown[]>)[wallet] ?? []

/** Serves the recording by path, like the Kamino API at recording time. */
function serveRecording(url: URL): Response {
  const path = url.pathname
  if (path === '/v2/kamino-market') return json(MARKETS_BODY)
  const obligations = path.match(
    /^\/kamino-market\/([^/]+)\/users\/([^/]+)\/obligations$/
  )
  if (obligations) {
    const [market, wallet] = obligations.slice(1).map(decodeURIComponent)
    return json(market === MARKET ? obligationsOf(wallet) : [])
  }
  if (path === '/kamino-market/reserves/account-data')
    return json(recording.accountData)
  if (path === '/reserves/batch/stats') return json(recording.stats)
  if (path === '/markets/batch/metadata') return json(recording.metadata)
  return new Response('not found', { status: 404 })
}

const urls = () => fetchMock.mock.calls.map(([input]) => new URL(String(input)))

afterEach(() => {
  fetchMock.mockReset()
  vi.restoreAllMocks()
  vi.useRealTimers()
  clearKaminoPositionsCache()
})

/** The recording through the real client, without the network. */
async function recordedReadings() {
  fetchMock.mockImplementation(async (input) =>
    serveRecording(new URL(String(input)))
  )
  return loadKaminoReadings([WALLET_A, WALLET_B])
}

/**
 * The prices the API valued the recording at: `totalSupplyUsd / totalSupply`
 * of each reserve in the batch stats recorded with it — exactly what the spot
 * collector writes to `apy_hourly.asset_price_usd` for the supply product.
 */
function recordedPrices(): PriceMap {
  const prices = new Map<string, number>()
  for (const [reserve, raw] of Object.entries(recording.stats)) {
    const price = assetPriceUsd({
      totalSupply: Number(raw.totalSupply),
      totalSupplyUsd: Number(raw.totalSupplyUsd),
    } as KaminoReserveStats)
    if (price != null) {
      prices.set(priceKeyId(kaminoPriceKey(MARKET, reserve)), price)
    }
  }
  return prices
}

/** The API's own refreshed stats of a recorded obligation. */
function apiStats(obligation: string) {
  const all = Object.values(recording.obligations).flat()
  const found = all.find((o) => o.obligationAddress === obligation)
  if (!found) throw new Error(`no recorded obligation ${obligation}`)
  return found.refreshedStats
}

describe('loadKaminoReadings', () => {
  it('converts collateral and debt to underlying tokens like the Kamino loan endpoint', async () => {
    const readings = await recordedReadings()
    const loans = recording.loans as Record<
      string,
      {
        loanInfo: {
          collateral: { deposits: { tokenName: string; tokenAmount: string }[] }
          debt: { borrows: { tokenName: string; tokenAmount: string }[] }
        }
      }
    >
    let checked = 0
    for (const r of readings) {
      const loan = loans[r.obligation].loanInfo
      for (const [ours, theirs] of [
        [r.deposits, loan.collateral.deposits],
        [r.borrows, loan.debt.borrows],
      ] as const) {
        for (const p of ours) {
          const expected = Number(
            theirs.find((t) => t.tokenName === p.symbol)?.tokenAmount
          )
          // /klend/loans estimates interest to its own slot; the reserve
          // accounts were read seconds apart.
          expect(Math.abs(p.amount / expected - 1)).toBeLessThan(1e-6)
          checked++
        }
      }
    }
    expect(checked).toBe(14)
  })

  it('keeps every obligation of every wallet, base58 case intact', async () => {
    const readings = await recordedReadings()
    expect(readings.map((r) => [r.owner, r.obligation])).toEqual([
      ...obligationsOf(WALLET_A).map((o) => [
        WALLET_A,
        (o as { obligationAddress: string }).obligationAddress,
      ]),
      ...obligationsOf(WALLET_B).map((o) => [
        WALLET_B,
        (o as { obligationAddress: string }).obligationAddress,
      ]),
    ])
    expect(readings[0].marketName).toBe('SOL/BTC Market')
  })

  it('reads one obligation list per market and wallet, and reserves only where there are obligations', async () => {
    await recordedReadings()
    const obligationCalls = urls().filter((u) =>
      u.pathname.endsWith('/obligations')
    )
    expect(obligationCalls).toHaveLength(MARKETS_BODY.length * 2)
    expect(obligationCalls[0].searchParams.get('env')).toBe('mainnet-beta')
    const accountData = urls().filter(
      (u) => u.pathname === '/kamino-market/reserves/account-data'
    )
    expect(accountData).toHaveLength(1)
    expect(accountData[0].searchParams.getAll('markets')).toEqual([MARKET])
    const stats = urls().filter((u) => u.pathname === '/reserves/batch/stats')
    expect(stats.map((u) => u.searchParams.get('market'))).toEqual([MARKET])
  })

  it(`keeps at most ${KAMINO_POSITIONS_CONCURRENCY} obligation reads in flight`, async () => {
    let inFlight = 0
    let peak = 0
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (!url.pathname.endsWith('/obligations')) return serveRecording(url)
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 2))
      inFlight--
      return json([])
    })
    const wallets = Array.from(
      { length: 5 },
      (_, i) => `${WALLET_A.slice(0, -1)}${i}`
    )
    await expect(loadKaminoReadings(wallets)).resolves.toEqual([])
    expect(peak).toBe(KAMINO_POSITIONS_CONCURRENCY)
    expect(
      urls().filter((u) => u.pathname.endsWith('/obligations'))
    ).toHaveLength(MARKETS_BODY.length * wallets.length)
  })

  it('rejects when one market cannot be read, so the portfolio flags Kamino', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (
        url.pathname.includes('DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek')
      ) {
        return new Response('boom', { status: 503 })
      }
      return serveRecording(url)
    })
    await expect(loadKaminoReadings([WALLET_A])).rejects.toMatchObject({
      name: 'KaminoApiError',
      status: 503,
    })
  })

  it('rejects when an obligation cannot be parsed instead of hiding it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (
        url.pathname.endsWith('/obligations') &&
        url.pathname.includes(MARKET)
      ) {
        return json([
          { obligationAddress: 'broken' },
          ...obligationsOf(WALLET_A),
        ])
      }
      return serveRecording(url)
    })
    await expect(loadKaminoReadings([WALLET_A])).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })

  it('rejects when a reserve of an obligation has no account data', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/kamino-market/reserves/account-data') {
        return json([
          {
            market: MARKET,
            reserves: recording.accountData[0].reserves.filter(
              (r) => r.pubkey !== BSOL
            ),
          },
        ])
      }
      return serveRecording(url)
    })
    await expect(loadKaminoReadings([WALLET_A])).rejects.toThrow(BSOL)
  })

  it('issues no call once the signal aborts', async () => {
    const controller = new AbortController()
    let started = 0
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (!url.pathname.endsWith('/obligations')) return serveRecording(url)
      started++
      // The source deadline passes while the first calls are in flight.
      if (started === KAMINO_POSITIONS_CONCURRENCY) controller.abort()
      await new Promise((resolve) => setTimeout(resolve, 2))
      return json([])
    })
    const wallets = Array.from(
      { length: 3 },
      (_, i) => `${WALLET_A.slice(0, -1)}${i}`
    )

    await expect(
      loadKaminoReadings(wallets, { signal: controller.signal })
    ).rejects.toBeDefined()
    const issued = urls().length
    await new Promise((resolve) => setTimeout(resolve, 20))

    // markets + the calls already in flight; none of the other 2 x 3 - 4.
    expect(started).toBe(KAMINO_POSITIONS_CONCURRENCY)
    expect(urls()).toHaveLength(issued)
  })

  it('issues nothing when the signal has already aborted', async () => {
    fetchMock.mockImplementation(async (input) =>
      serveRecording(new URL(String(input)))
    )
    await expect(
      loadKaminoReadings([WALLET_A], { signal: AbortSignal.abort() })
    ).rejects.toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('serves a repeated read from the cache without a call', async () => {
    const first = await recordedReadings()
    const calls = fetchMock.mock.calls.length
    expect(calls).toBeGreaterThan(0)

    const second = await loadKaminoReadings([WALLET_A, WALLET_B])

    expect(fetchMock.mock.calls.length).toBe(calls)
    expect(second).toEqual(first)
  })

  it('shares market data across wallets and re-reads lists after their TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await recordedReadings()
    const before = urls().length

    // Another wallet: only its obligation lists are new.
    const other = `${WALLET_B.slice(0, -1)}9`
    await loadKaminoReadings([other])
    const newCalls = urls().slice(before)
    expect(newCalls).toHaveLength(MARKETS_BODY.length)
    expect(newCalls.every((u) => u.pathname.endsWith('/obligations'))).toBe(
      true
    )

    // Obligation lists expire first; markets, accounts and stats later.
    vi.setSystemTime(Date.now() + KAMINO_OBLIGATIONS_TTL_MS)
    const mark = urls().length
    await loadKaminoReadings([WALLET_A])
    expect(
      urls()
        .slice(mark)
        .every((u) => u.pathname.endsWith('/obligations'))
    ).toBe(true)
    expect(urls().length - mark).toBe(MARKETS_BODY.length)

    vi.setSystemTime(Date.now() + KAMINO_MARKET_DATA_TTL_MS)
    const late = urls().length
    await loadKaminoReadings([WALLET_A])
    const paths = urls()
      .slice(late)
      .map((u) => u.pathname)
    expect(paths).toContain('/v2/kamino-market')
    expect(paths).toContain('/kamino-market/reserves/account-data')
    expect(paths).toContain('/reserves/batch/stats')
  })

  it('keeps no failed read', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/kamino-market/reserves/account-data') {
        return new Response('boom', { status: 502 })
      }
      return serveRecording(url)
    })
    await expect(loadKaminoReadings([WALLET_A])).rejects.toMatchObject({
      status: 502,
    })

    fetchMock.mockImplementation(async (input) =>
      serveRecording(new URL(String(input)))
    )
    await expect(loadKaminoReadings([WALLET_A])).resolves.toHaveLength(4)
  })

  it('reads nothing without a wallet', async () => {
    await expect(loadKaminoReadings([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Kamino health factor', () => {
  it('equals borrowLiquidationLimit / userTotalBorrowBorrowFactorAdjusted for every recorded loan', async () => {
    const readings = await recordedReadings()
    const prices = recordedPrices()
    const withDebt = readings.filter((r) => r.borrows.length > 0)
    expect(withDebt).toHaveLength(5)
    for (const r of withDebt) {
      const account = riskAccountFromReading(r)
      expect(account).not.toBeNull()
      const result = calculateHealthFactor(account!.reserves, prices)
      const api = apiStats(r.obligation)
      const expected =
        Number(api.borrowLiquidationLimit) /
        Number(api.userTotalBorrowBorrowFactorAdjusted)
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') continue
      expect(Math.abs(result.healthFactor - expected)).toBeLessThan(1e-6)
      expect(
        Math.abs(
          result.weightedLiabilityUsd /
            Number(api.userTotalBorrowBorrowFactorAdjusted) -
            1
        )
      ).toBeLessThan(1e-6)
    }
  })

  it('weighs an eMode obligation with its group threshold and a borrow factor of 1', async () => {
    const readings = await recordedReadings()
    const emode = readings.find((r) => r.obligation === EMODE)!
    expect(emode.elevationGroup).toBe(2)
    const account = riskAccountFromReading(emode)!
    expect(account.reserves).toEqual([
      expect.objectContaining({
        symbol: 'bSOL',
        collateralWeight: 0.92,
        liability: 0,
      }),
      expect.objectContaining({
        symbol: 'SOL',
        collateral: 0,
        liabilityWeight: 1,
      }),
    ])
  })

  it('weighs a plain obligation with the reserve threshold and 1 / borrowFactor', async () => {
    const readings = await recordedReadings()
    const plain = readings.find((r) => r.obligation === LEVERAGE)!
    expect(plain.elevationGroup).toBe(0)
    expect(riskAccountFromReading(plain)!.reserves).toEqual([
      expect.objectContaining({ symbol: 'USDC', collateralWeight: 0.9 }),
      expect.objectContaining({ symbol: 'SOL', liabilityWeight: 0.8 }),
    ])
  })

  it('keeps the reserve weights when the reserve is not in the obligation group (klend-sdk rule)', () => {
    const obligation = findObligation(EMODE)
    const reserves = reserveMap()
    const sol = reserves.get(SOL)!
    reserves.set(SOL, { ...sol, elevationGroups: [4, 7] })
    const reading = readingFromObligation(obligation, {
      marketName: 'SOL/BTC Market',
      reserves,
      stats: statsMap(),
    })
    expect(riskAccountFromReading(reading)!.reserves).toEqual([
      expect.objectContaining({ symbol: 'bSOL', collateralWeight: 0.92 }),
      expect.objectContaining({ symbol: 'SOL', liabilityWeight: 0.8 }),
    ])
  })

  it('leaves the threshold unknown when the obligation group is not in the market', () => {
    const obligation = { ...findObligation(EMODE), elevationGroups: [] }
    const reading = readingFromObligation(obligation, {
      marketName: 'SOL/BTC Market',
      reserves: reserveMap(),
      stats: statsMap(),
    })
    const account = riskAccountFromReading(reading)!
    expect(account.reserves[0].collateralWeight).toBeNull()
    expect(calculateHealthFactor(account.reserves, recordedPrices())).toEqual({
      status: 'unknown',
      reason: 'invalid-weight',
      symbols: ['bSOL'],
    })
  })

  it('confirms every recorded reserve weight with its batch stats', () => {
    const stats = statsMap()
    for (const reserve of reserveMap().values()) {
      expect(weightsMatchStats(reserve, stats.get(reserve.reserve))).toBe(true)
    }
    const [any] = reserveMap().values()
    expect(weightsMatchStats(any, undefined)).toBe(false)
  })

  it('fails closed on a reserve whose decoded weights the stats contradict', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tampered = structuredClone(recording.stats) as Record<
      string,
      Record<string, unknown>
    >
    tampered[SOL].borrowFactor = '1.5'
    tampered[USDC].liqLTV = '0.85'
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/reserves/batch/stats') return json(tampered)
      return serveRecording(url)
    })

    const readings = await loadKaminoReadings([WALLET_A, WALLET_B])

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(SOL))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(USDC))
    const prices = recordedPrices()
    const results = readings.flatMap((r) => {
      const account = riskAccountFromReading(r)
      return account ? [calculateHealthFactor(account.reserves, prices)] : []
    })
    // Every recorded loan touches SOL or USDC: none gets a number.
    expect(results).toHaveLength(5)
    for (const result of results) {
      expect(result).toMatchObject({
        status: 'unknown',
        reason: 'invalid-weight',
      })
    }
    const leverage = riskAccountFromReading(
      readings.find((r) => r.obligation === LEVERAGE)!
    )!
    expect(leverage.reserves).toEqual([
      expect.objectContaining({ symbol: 'USDC', collateralWeight: null }),
      expect.objectContaining({ symbol: 'SOL', liabilityWeight: null }),
    ])
  })

  it('is unknown when a reserve has no price', async () => {
    const readings = await recordedReadings()
    const account = riskAccountFromReading(
      readings.find((r) => r.obligation === LEVERAGE)!
    )!
    const prices = recordedPrices()
    const [result] = await computeRiskAccounts([account], async () => {
      const without = new Map(prices)
      without.delete(priceKeyId(kaminoPriceKey(MARKET, SOL)))
      return without
    })
    expect(result.result).toEqual({
      status: 'unknown',
      reason: 'missing-price',
      symbols: ['SOL'],
    })
  })

  it('makes no risk account for an obligation without debt', async () => {
    const readings = await recordedReadings()
    expect(
      riskAccountFromReading(readings.find((r) => r.obligation === NO_DEBT)!)
    ).toBeNull()
  })

  it('identifies one risk account per obligation', async () => {
    const readings = await recordedReadings()
    const ids = readings.flatMap((r) => riskAccountFromReading(r)?.id ?? [])
    expect(new Set(ids).size).toBe(5)
    expect(riskAccountFromReading(readings[0])).toMatchObject({
      protocol: 'kamino_v1',
      chainFamily: 'solana',
      chainId: -2,
      poolId: readings[0].obligation,
      user: WALLET_A,
    })
  })
})

describe('Kamino positions', () => {
  it('lists one supply row per deposit, valued at the pipeline price', async () => {
    const readings = await recordedReadings()
    const prices = recordedPrices()
    const rows = readings.flatMap((r) => supplyPositionsFromReading(r, prices))
    expect(rows).toHaveLength(7)
    expect(new Set(rows.map((r) => r.id)).size).toBe(7)
    const usdc = rows.find((r) => r.poolId === LEVERAGE)!
    expect(usdc).toMatchObject({
      protocol: 'kamino_v1',
      network: 'solana',
      userAddress: WALLET_A,
      poolId: LEVERAGE,
      poolAddress: MARKET,
      poolChainId: -2,
      poolName: 'SOL/BTC Market · Leverage',
      assetAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      assetSymbol: 'USDC',
      assetDecimals: 6,
      link: `https://kamino.com/borrow/reserve/${MARKET}/${USDC}`,
    })
    expect(Number(usdc.assetAmount) / 1e6).toBeCloseTo(36.876, 3)
    expect(usdc.assetAmountUsd).toBeCloseTo(36.867, 2)
    expect(usdc.apy).toBeGreaterThan(0)
  })

  it('names a vanilla obligation by its market only', async () => {
    const readings = await recordedReadings()
    const rows = readings.flatMap((r) =>
      supplyPositionsFromReading(r, new Map())
    )
    expect(rows.find((r) => r.userAddress === WALLET_B)?.poolName).toBe(
      'SOL/BTC Market'
    )
  })

  it('lists one borrow row per debt, tied to its obligation risk account', async () => {
    const readings = await recordedReadings()
    const prices = recordedPrices()
    const rows = readings.flatMap((r) => borrowPositionsFromReading(r, prices))
    expect(rows).toHaveLength(7)
    const emode = rows.find((r) => r.poolId === EMODE)!
    expect(emode).toMatchObject({
      protocol: 'kamino_v1',
      network: 'solana',
      loanAssetSymbol: 'SOL',
      loanAssetDecimals: 9,
      riskAccountId: riskAccountFromReading(
        readings.find((r) => r.obligation === EMODE)!
      )!.id,
      collaterals: [expect.objectContaining({ symbol: 'bSOL', lltv: 0.92 })],
    })
    expect(emode.loanAssetAmount).toBeCloseTo(0.13013, 5)
    expect(emode.loanAssetAmountUsd).toBeCloseTo(13.079, 2)
  })

  it('falls back to the live Kamino price when the pipeline has none', async () => {
    const readings = await recordedReadings()
    const [row] = supplyPositionsFromReading(
      readings.find((r) => r.obligation === LEVERAGE)!,
      new Map()
    )
    expect(row.assetAmountUsd).toBeCloseTo(36.867, 2)
  })
})

describe('positionsAdapter', () => {
  it('shares one Kamino read between supply, borrow and risk', async () => {
    fetchMock.mockImplementation(async (input) =>
      serveRecording(new URL(String(input)))
    )
    const [supply, borrow, risk] = await Promise.all([
      positionsAdapter.getUserSupplyPositions({ addresses: [WALLET_A] }),
      positionsAdapter.getUserBorrowPositions({ addresses: [WALLET_A] }),
      positionsAdapter.getRiskAccounts!({ addresses: [WALLET_A] }),
    ])
    expect(supply).toHaveLength(4)
    expect(borrow).toHaveLength(6)
    expect(risk).toHaveLength(4)
    expect(
      urls().filter((u) => u.pathname === '/v2/kamino-market')
    ).toHaveLength(1)
  })

  it(`declares a cap of ${KAMINO_POSITIONS_MAX_WALLETS} wallets and refuses more`, async () => {
    expect(positionsAdapter.maxAddresses).toBe(KAMINO_POSITIONS_MAX_WALLETS)
    const many = Array.from(
      { length: KAMINO_POSITIONS_MAX_WALLETS + 1 },
      (_, i) => `${WALLET_A.slice(0, -1)}${i}`
    )
    await expect(
      positionsAdapter.getUserSupplyPositions({ addresses: many })
    ).rejects.toThrow(`at most ${KAMINO_POSITIONS_MAX_WALLETS}`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes the portfolio signal down to the Kamino calls', async () => {
    fetchMock.mockImplementation(async (input) =>
      serveRecording(new URL(String(input)))
    )
    await expect(
      positionsAdapter.getUserSupplyPositions({
        addresses: [WALLET_A],
        signal: AbortSignal.abort(),
      })
    ).rejects.toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('escapes the wallet in the request path', async () => {
    fetchMock.mockImplementation(async (input) =>
      serveRecording(new URL(String(input)))
    )
    await positionsAdapter.getUserSupplyPositions({ addresses: ['a/b?c'] })
    const call = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((u) => u.includes('/users/'))
    expect(call).toContain('/users/a%2Fb%3Fc/obligations')
  })
})

function findObligation(address: string): KaminoObligation {
  const all = Object.values(recording.obligations).flat() as unknown[]
  return obligationSchema.parse(
    all.find(
      (o) => (o as { obligationAddress: string }).obligationAddress === address
    )
  )
}

function statsMap(): Map<string, KaminoReserveStats> {
  return new Map(
    Object.entries(recording.stats).map(([reserve, raw]) => [
      reserve,
      { ...reserveStatsSchema.parse(raw), market: MARKET, reserve },
    ])
  )
}

function reserveMap(): Map<string, KaminoReserveAccount> {
  return new Map(
    recording.accountData[0].reserves.map((r) => [
      r.pubkey,
      { market: MARKET, reserve: r.pubkey, ...decodeReserveAccount(r.data) },
    ])
  )
}
