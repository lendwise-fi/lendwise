import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BorrowProduct, SpotPayload, SupplyProduct } from '@/lib/db/types'

import marketsMetadata from '../../__tests__/fixtures/markets-metadata.json'
import markets from '../../__tests__/fixtures/markets.json'
import reserveStats from '../../__tests__/fixtures/reserve-stats.json'
import accountData from '../../__tests__/fixtures/reserves-account-data.json'
import type { KaminoReserveStats } from '../../common/api'
import { fetchReserveStats } from '../../common/api'
import { isListedReserve } from '../../listing'
import { adapter } from '../index'
import type { KaminoBorrowMeta, KaminoSupplyMeta } from '../types'

const PRIMARY = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
const USDC = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const HIDDEN = '4eUxuaHSHNTftaui3XVW32d2Ph2hKBLpuMP25gQ5MqF4'
const OBSOLETE = '5YpGenXaAowj4HS33AvirVb8P4tgue7S7YaY6MyYZ7LD'
const FIXED = '8Lvi1DFPoAGPQ25qpRKzzRaSAnWdeVZqt9XmEapm8uLt'
const ADRASOL = '64AZMUHLB6NYvQSt41JTer4v8NAFDCz5sUPb7dYpCxa'
const STRONGSOL = 'A2J2CEwmwa9aTKbEfNoik6YTyNep9GtvNjU65okWYhwn'

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

function route(url: URL): Response {
  if (url.pathname === '/v2/kamino-market') return json(markets)
  if (url.pathname === '/reserves/batch/stats') return json(reserveStats)
  if (url.pathname === '/markets/batch/metadata') return json(marketsMetadata)
  if (url.pathname === '/kamino-market/reserves/account-data')
    return json(accountData)
  return new Response('not found', { status: 404 })
}

function installRoutes() {
  fetchMock.mockImplementation(async (input) => route(new URL(String(input))))
}

afterEach(() => {
  fetchMock.mockReset()
})

async function stats(): Promise<KaminoReserveStats[]> {
  installRoutes()
  return fetchReserveStats([PRIMARY, ...Object.keys(marketsMetadata)])
}

describe('listing predicate', () => {
  it('keeps Active variable-rate reserves and drops Hidden, Obsolete and fixed', async () => {
    const all = await stats()
    const listed = all.filter(isListedReserve).map((r) => r.reserve)
    expect(listed.sort()).toEqual([ADRASOL, STRONGSOL, USDC].sort())
    expect(listed).not.toContain(HIDDEN)
    expect(listed).not.toContain(OBSOLETE)
    expect(listed).not.toContain(FIXED)
  })

  it('declares no ingestion floor', () => {
    expect(adapter.ingestion ?? {}).toEqual({})
  })
})

describe('adapter identity', () => {
  it('declares Solana only and owns its market discovery', () => {
    expect(adapter.id).toBe('kamino_v1')
    expect(adapter.name).toBe('Kamino Lend')
    expect(adapter.provider).toBe('kamino')
    expect(adapter.version).toBe('v1')
    expect(adapter.chains).toEqual({ '-2': { slug: 'solana' } })
    expect(adapter.ownsMarketDiscovery).toBeUndefined()
  })
})

describe('getProducts', () => {
  it('builds supply products for every listed reserve and borrow only for borrowable ones', async () => {
    installRoutes()
    const products = await adapter.getProducts()
    const ids = products.map((p) => p._id).sort()
    expect(ids).toEqual(
      [
        `kamino:v1:solana:reserve:${PRIMARY}:${ADRASOL}:supply`,
        `kamino:v1:solana:reserve:${PRIMARY}:${STRONGSOL}:supply`,
        `kamino:v1:solana:reserve:${PRIMARY}:${USDC}:supply`,
        `kamino:v1:solana:reserve:${PRIMARY}:${USDC}:borrow`,
      ].sort()
    )
  })

  it('reads account data only for markets with a listed reserve, and no metrics call', async () => {
    installRoutes()
    await adapter.getProducts()
    const urls = fetchMock.mock.calls.map(([i]) => new URL(String(i)))
    const acct = urls.filter((u) => u.pathname.endsWith('/account-data'))
    expect(acct).toHaveLength(1)
    expect(acct[0].searchParams.getAll('markets')).toEqual([PRIMARY])
    expect(urls.some((u) => u.pathname.endsWith('/reserves/metrics'))).toBe(
      false
    )
  })

  it('carries on-chain decimals on assets and collaterals', async () => {
    installRoutes()
    const products = await adapter.getProducts()
    const supply = products.find((p) => p._id.endsWith(`${USDC}:supply`))!
    expect(supply.asset.decimals).toBe(6)
    const borrow = products.find((p) =>
      p._id.endsWith(`${USDC}:borrow`)
    ) as BorrowProduct
    expect(borrow.asset.decimals).toBe(6)
    expect(
      borrow.collaterals.find((c) => c.symbol === 'strongSOL')?.decimals
    ).toBe(9)
  })

  it('skips a reserve whose decoded mint differs from its stats mint', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installRoutes()
    const stale = structuredClone(reserveStats) as Record<
      string,
      { token: string }
    >
    stale[ADRASOL].token = USDC_MINT
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/reserves/batch/stats') return json(stale)
      return route(url)
    })
    const ids = (await adapter.getProducts()).map((p) => p._id)
    expect(ids.some((id) => id.includes(ADRASOL))).toBe(false)
    expect(ids.some((id) => id.includes(STRONGSOL))).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(ADRASOL))
    warn.mockRestore()
  })

  it('shapes the USDC supply product with meta read back by history', async () => {
    installRoutes()
    const products = await adapter.getProducts()
    const supply = products.find((p) =>
      p._id.endsWith(`${USDC}:supply`)
    ) as SupplyProduct<KaminoSupplyMeta>
    expect(supply.kind).toBe('supply')
    expect(supply.active).toBe(true)
    expect(supply.asset).toMatchObject({ symbol: 'USDC', address: USDC_MINT })
    expect(supply.protocol).toMatchObject({
      provider: 'kamino',
      version: 'v1',
      type: 'reserve',
      chain: { id: -2, name: 'solana' },
      address: USDC,
    })
    expect(supply.protocol.meta).toEqual({
      market: PRIMARY,
      reserve: USDC,
      mint: USDC_MINT,
      marketName: 'SOL/BTC Market',
      symbol: 'USDC',
    })
  })

  it('lists the market collateral on the borrow product', async () => {
    installRoutes()
    const products = await adapter.getProducts()
    const borrow = products.find((p) =>
      p._id.endsWith(`${USDC}:borrow`)
    ) as BorrowProduct<KaminoBorrowMeta>
    expect(borrow.kind).toBe('borrow')
    expect(borrow.protocol.meta.reserve).toBe(USDC)
    const usdc = borrow.collaterals.find((c) => c.address === USDC_MINT)
    expect(usdc).toMatchObject({
      symbol: 'USDC',
      ltv: 0.8,
      lltv: 0.9,
      canBeCollateral: true,
    })
    // adraSOL / strongSOL have maxLtv 0.45 in this market.
    expect(borrow.collaterals.map((c) => c.symbol).sort()).toEqual([
      'USDC',
      'adraSOL',
      'strongSOL',
    ])
  })

  it('returns nothing when chainIds excludes Solana', async () => {
    installRoutes()
    expect(await adapter.getProducts({ chainIds: [1, 8453] })).toEqual([])
    expect(await adapter.getApySpot({ chainIds: [1] })).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects when an account-data batch fails instead of dropping products', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/account-data'))
        return new Response('boom', { status: 500 })
      return route(url)
    })
    await expect(adapter.getProducts({ chainIds: [-2] })).rejects.toMatchObject(
      { name: 'KaminoApiError', kind: 'http', status: 500 }
    )
  })
})

describe('getApySpot', () => {
  async function spot(): Promise<SpotPayload[]> {
    installRoutes()
    return adapter.getApySpot()
  }

  it('emits one payload per product and no metadata request', async () => {
    const payloads = await spot()
    expect(payloads.map((p) => p.productId).sort()).toEqual(
      [
        `kamino:v1:solana:reserve:${PRIMARY}:${ADRASOL}:supply`,
        `kamino:v1:solana:reserve:${PRIMARY}:${STRONGSOL}:supply`,
        `kamino:v1:solana:reserve:${PRIMARY}:${USDC}:supply`,
        `kamino:v1:solana:reserve:${PRIMARY}:${USDC}:borrow`,
      ].sort()
    )
    const paths = fetchMock.mock.calls.map(([i]) => new URL(String(i)).pathname)
    expect(paths.some((p) => p.includes('account-data'))).toBe(false)
  })

  it('computes USDC supply: base = lending, no reward, net = base', async () => {
    const p = (await spot()).find((x) =>
      x.productId.endsWith(`${USDC}:supply`)
    )!
    expect(p).toMatchObject({
      kind: 'supply',
      protocol: 'kamino',
      chainId: -2,
    })
    expect(p.apy.base).toBeCloseTo(0.04412476485020544, 12)
    expect(p.apy.rewards).toBe(0)
    expect(p.apy.fees).toBe(0)
    expect(p.apy.net).toBeCloseTo(0.04412476485020544, 12)
    expect(p.apy.rewardItems).toEqual([])
    const m = p.market as {
      supplyAssets: number
      supplyAssetsUsd: number
      utilizationRate: number
      assetPriceUsd: number
    }
    expect(m.supplyAssets).toBeCloseTo(133017919.9428622, 3)
    expect(m.supplyAssetsUsd).toBeCloseTo(132977909.4827226, 3)
    expect(m.utilizationRate).toBeCloseTo(0.9094964414612668, 12)
    expect(m.assetPriceUsd).toBeCloseTo(
      132977909.4827226 / 133017919.9428622,
      12
    )
  })

  it('computes USDC borrow: base = borrow, net = base - rewards, market state', async () => {
    const p = (await spot()).find((x) =>
      x.productId.endsWith(`${USDC}:borrow`)
    )!
    expect(p.kind).toBe('borrow')
    expect(p.apy.base).toBeCloseTo(0.05945094596218459, 12)
    expect(p.apy.rewards).toBe(0)
    expect(p.apy.net).toBeCloseTo(0.05945094596218459, 12)
    expect(p.market).toMatchObject({
      collateralAssetsUsd: null,
      priceCollateralInLoanAsset: null,
    })
    const m = p.market as { borrowAssets: number; borrowAssetsUsd: number }
    expect(m.borrowAssets).toBeCloseTo(120979324.83861288, 3)
    expect(m.borrowAssetsUsd).toBeCloseTo(120942935.46749467, 3)
  })

  it('adds incentives and reward items; leaves underlying yield out', async () => {
    const p = (await spot()).find((x) =>
      x.productId.endsWith(`${STRONGSOL}:supply`)
    )!
    expect(p.apy.base).toBe(0)
    expect(p.apy.rewards).toBeCloseTo(0.00772649351543883, 12)
    expect(p.apy.net).toBeCloseTo(0.00772649351543883, 12) // underlying 4.7% excluded
    expect(p.apy.rewardItems).toEqual([
      {
        token: { symbol: 'strongSOL', address: STRONGSOL_MINT },
        apr: 0.00772649351543883,
        apy: 0.00772649351543883,
        source: 'protocol',
        program: null,
      },
    ])
  })

  it('falls back to the mint and warns once for an unknown reward mint', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const all = await stats()
    const usdc = all.find((r) => r.reserve === USDC)!
    const { buildSpotPayloads } = await import('../apy-spot')
    const unknown: KaminoReserveStats = {
      ...usdc,
      supplyRewards: [
        { rewardToken: 'UnknownMint111', apy: 0.01, tokensPerSecond: null },
        {
          rewardToken: 'BLZEEuZUBVqFhj8adcCFPJvPVCiCyVmh3hkJMrU8KuJA',
          apy: 0.02,
          tokensPerSecond: null,
        },
      ],
    }
    buildSpotPayloads([unknown])
    buildSpotPayloads([unknown])
    const [supply] = buildSpotPayloads([unknown])
    expect(supply.apy.rewardItems.map((r) => r.token.symbol)).toEqual([
      'UnknownMint111',
      'BLZE',
    ])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('UnknownMint111'))
    warn.mockRestore()
  })

  it('subtracts borrow incentives from the borrow net', async () => {
    const all = await stats()
    const usdc = all.find((r) => r.reserve === USDC)!
    const rewarded: KaminoReserveStats = {
      ...usdc,
      borrowApyBreakdown: { ...usdc.borrowApyBreakdown, incentives: 0.01 },
      borrowRewards: [
        { rewardToken: 'MINT', apy: 0.01, tokensPerSecond: null },
      ],
    }
    fetchMock.mockReset()
    const { buildSpotPayloads } = await import('../apy-spot')
    const out = buildSpotPayloads([rewarded])
    const borrow = out.find((x) => x.kind === 'borrow')!
    expect(borrow.apy.rewards).toBe(0.01)
    expect(borrow.apy.net).toBeCloseTo(0.05945094596218459 - 0.01, 12)
    expect(borrow.apy.rewardItems).toHaveLength(1)
  })

  it('leaves the price null when nothing is supplied', async () => {
    const all = await stats()
    const usdc = all.find((r) => r.reserve === USDC)!
    const { buildSpotPayloads } = await import('../apy-spot')
    const [supply] = buildSpotPayloads([
      { ...usdc, totalSupply: 0, totalSupplyUsd: 0, borrowLimit: 0 },
    ])
    expect(
      (supply.market as { assetPriceUsd: number | null }).assetPriceUsd
    ).toBeNull()
  })
})

const STRONGSOL_MINT = 'strng7mqqc1MBJJV6vMzYbEqnwVGvKKGKedeCvtktWA'
