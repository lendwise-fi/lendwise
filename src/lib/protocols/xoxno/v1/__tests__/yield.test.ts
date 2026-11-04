import { describe, expect, it, vi } from 'vitest'

import { createXoxnoClient } from '../client'
import { XOXNO_MAINNET } from '../config'
import { createXoxnoHistory } from '../history'
import { createXoxnoYieldReads, xoxnoSupplyBreakdown } from '../products'
import { parseXoxnoMeta } from '../schemas'
import { xoxnoProductId } from '../utils'
import { SAC_A, SAC_B, contextFixture, json, sdkAsset } from './fixtures'

function fixtureFetch(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '/stellar-lending/context': contextFixture(),
    '/stellar-lending/markets/detailed': [
      {
        hubId: 1,
        asset: SAC_A,
        usdPriceShort: 2,
        valid: true,
        stale: false,
        deviation: false,
      },
      {
        hubId: 1,
        asset: SAC_B,
        usdPriceShort: 2,
        valid: false,
        stale: true,
        deviation: false,
      },
      {
        hubId: 2,
        asset: SAC_A,
        usdPriceShort: 2,
        valid: true,
        stale: false,
        deviation: false,
      },
    ],
    '/stellar-lending/v1/assets?usage=collateral': [
      sdkAsset(),
      sdkAsset(SAC_B, 1, [1]),
      sdkAsset(SAC_A, 2, [1]),
    ],
    '/stellar-lending/v1/assets?usage=borrow': [
      sdkAsset(),
      sdkAsset(SAC_A, 2, [1]),
    ],
    ...overrides,
  }
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const value = routes[url.pathname + url.search]
    return value === undefined
      ? new Response('missing fixture', { status: 500 })
      : json(value)
  }) as unknown as typeof fetch
}

describe('XOXNO catalogue and spot', () => {
  it('discovers full hub/SAC catalogue without duplicating shared spoke liquidity', async () => {
    const fetcher = fixtureFetch()
    const read = createXoxnoYieldReads(createXoxnoClient({ fetch: fetcher }))
    const [products, spot] = await Promise.all([
      read.getProducts(),
      read.getApySpot(),
    ])
    expect(products).toHaveLength(5)
    expect(new Set(products.map((p) => p._id)).size).toBe(5)
    expect(fetcher).toHaveBeenCalledTimes(4)
    const supply = products.find(
      (p) =>
        p.asset.address === SAC_A &&
        p.protocol.meta.hubId === 1 &&
        p.kind === 'supply'
    )!
    expect(supply.protocol.meta.spokes.map((s) => s.spokeId)).toEqual([1, 2])
    expect(supply.protocol.meta.spokes[0].collaterals).toHaveLength(3)
    expect(supply.protocol.meta.spokes[0].ltv).toBe(0.7)
    expect(supply.protocol.meta.spokes[1].ltv).toBe(0.5)
    expect(parseXoxnoMeta(supply.protocol.meta)).toEqual(supply.protocol.meta)
    const observation = spot.find((p) => p.productId === supply._id)!
    expect(observation.market.supplyAssets).toBe(100)
    expect(observation.market.supplyAssetsUsd).toBe(200)
    expect(observation.market.availableLiquidity).toBe(70)
    expect(observation.apy.net).toBe(0.02)
    expect(observation.apy.base! - observation.apy.fees!).toBeCloseTo(0.02, 14)
    expect(
      spot.find(
        (p) => p.asset === 'SAME' && p.productId.includes(SAC_B.toLowerCase())
      )!.market.supplyAssetsUsd
    ).toBeNull()
    const borrow = products.find((p) => p.kind === 'borrow')!
    if (borrow.kind === 'borrow')
      expect(
        borrow.collaterals.every(
          (c) => c.ltv === null && c.lltv === null && !c.canBeCollateral
        )
      ).toBe(true)
  })

  it('undoes compounding before applying utilization', () => {
    const breakdown = xoxnoSupplyBreakdown(0.02, 0.1, 0.25)
    expect(breakdown.base).toBeCloseTo(
      (1 + (1.1 ** (1 / 365) - 1) * 0.25) ** 365 - 1,
      12
    )
    expect(breakdown.base).not.toBeCloseTo(0.1 * 0.25, 4)
    expect(xoxnoSupplyBreakdown(0.02, null, 0.25)).toMatchObject({
      base: null,
      fees: null,
      net: 0.02,
    })
  })

  it('values hub balances with the validated price instead of cached USD zeros', async () => {
    const context = contextFixture()
    for (const detail of Object.values(context.reserveDetailsByKey)) {
      detail.hubPool.depositsUsd = 0
      detail.hubPool.borrowsUsd = 0
      detail.availableLiquidityUsd = 0
    }
    const read = createXoxnoYieldReads(
      createXoxnoClient({
        fetch: fixtureFetch({ '/stellar-lending/context': context }),
      })
    )
    const spots = await read.getApySpot()
    const spot = spots.find((p) => p.kind === 'borrow')!
    expect(spot.market).toMatchObject({
      supplyAssetsUsd: 200,
      borrowAssetsUsd: 50,
      availableLiquidityUsd: 140,
    })
  })

  it('preserves unknown native cash and balances despite a valid price', async () => {
    const context = contextFixture()
    const details = Object.fromEntries(
      Object.entries(context.reserveDetailsByKey).map(([key, detail]) => [
        key,
        {
          ...detail,
          availableLiquidityShort: null,
          hubPool: {
            ...detail.hubPool,
            suppliedShort: null,
            borrowedShort: null,
          },
        },
      ])
    )
    const read = createXoxnoYieldReads(
      createXoxnoClient({
        fetch: fixtureFetch({
          '/stellar-lending/context': {
            ...context,
            reserveDetailsByKey: details,
          },
        }),
      })
    )
    const spots = await read.getApySpot()
    expect(spots.find((p) => p.kind === 'borrow')!.market).toMatchObject({
      supplyAssetsUsd: null,
      borrowAssetsUsd: null,
      availableLiquidityUsd: null,
    })
  })

  it('throws for failed or incomplete discovery, never silently delists', async () => {
    const broken = contextFixture()
    delete broken.reserveDetailsByKey[`1:1:${SAC_A}`]
    await expect(
      createXoxnoYieldReads(
        createXoxnoClient({
          fetch: fixtureFetch({ '/stellar-lending/context': broken }),
        })
      ).getProducts()
    ).rejects.toThrow('Incomplete XOXNO discovery')
    const fetcher = vi.fn(
      async () => new Response('error', { status: 503 })
    ) as unknown as typeof fetch
    await expect(
      createXoxnoYieldReads(createXoxnoClient({ fetch: fetcher })).getProducts()
    ).rejects.toThrow('HTTP 503')
  })

  it('rejects mixed network assets and malformed consumed fields', async () => {
    const wrong = { ...sdkAsset(), network: 'testnet' }
    const client = createXoxnoClient({
      fetch: fixtureFetch({
        '/stellar-lending/v1/assets?usage=borrow': [wrong],
      }),
    })
    await expect(client.assets('borrow')).rejects.toThrow('network')
    const malformed = { ...sdkAsset(), hubId: '1' }
    await expect(
      createXoxnoClient({
        fetch: fixtureFetch({
          '/stellar-lending/v1/assets?usage=borrow': [malformed],
        }),
      }).assets('borrow')
    ).rejects.toThrow()
  })

  it('canonical IDs use contracts, hub and kind, with no symbol dependence', () => {
    const base = {
      ...XOXNO_MAINNET,
      hubId: 1,
      asset: SAC_A,
      kind: 'supply' as const,
    }
    expect(xoxnoProductId(base)).not.toBe(xoxnoProductId({ ...base, hubId: 2 }))
    expect(xoxnoProductId(base)).not.toBe(
      xoxnoProductId({ ...base, asset: SAC_B })
    )
    expect(xoxnoProductId(base)).not.toBe(
      xoxnoProductId({ ...base, kind: 'borrow' })
    )
    expect(xoxnoProductId(base)).not.toBe(
      xoxnoProductId({ ...base, network: 'testnet' })
    )
  })
})

describe('XOXNO history', () => {
  it('repairs delisted targets from stored metadata, clips bins, keeps exact net and unknown split', async () => {
    const start = Date.parse('2026-01-02T12:00:00Z') / 1000
    const meta = {
      network: 'mainnet' as const,
      controller: XOXNO_MAINNET.controller,
      hubId: 8,
      asset: SAC_A,
      historySpokeId: 12,
    }
    const productId = xoxnoProductId({ ...meta, kind: 'supply' })
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe(`/stellar-lending/reserves/12/8/${SAC_A}/graph`)
      expect(url.searchParams.get('bin')).toBe('1h')
      expect(url.searchParams.get('to')).toBe('2026-01-03')
      return json({
        points: [11, 12, 13, 14].map((hour) => ({
          timestamp: `2026-01-02T${hour}:00:00Z`,
          hubId: 8,
          token: SAC_A,
          supplyApy: 0.03,
          borrowApy: 0.08,
          utilization: 0.5,
          totalDepositsUsd: 20,
          totalBorrowsUsd: 10,
          availableLiquidityUsd: 7,
          usdPrice: 2,
        })),
      })
    }) as unknown as typeof fetch
    const result = await createXoxnoHistory(
      createXoxnoClient({ fetch: fetcher })
    )({
      startTimestamp: start,
      endTimestamp: start + 3600,
      interval: 'HOUR',
      targets: [{ productId, chainId: -1, kind: 'supply', meta }],
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.failures).toEqual([])
    expect(result.points).toHaveLength(2)
    expect(result.points[0].apy).toMatchObject({
      net: 0.03,
      base: null,
      fees: null,
      rewards: 0,
    })
    expect(result.points[0].market).toMatchObject({
      supplyAssets: 10,
      availableLiquidity: 3.5,
    })
  })

  it('reports per-product failures without discarding successful groups', async () => {
    const meta = {
      network: 'mainnet' as const,
      controller: XOXNO_MAINNET.controller,
      hubId: 1,
      asset: SAC_A,
      historySpokeId: 1,
    }
    const targets = [1, 2].map((hubId) => ({
      productId: xoxnoProductId({ ...meta, hubId, kind: 'borrow' }),
      chainId: -1,
      kind: 'borrow' as const,
      meta: { ...meta, hubId },
    }))
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('/1/2/')
        ? new Response('failure', { status: 429 })
        : json({
            points: [
              {
                timestamp: '2026-01-01T00:00:00Z',
                hubId: 1,
                token: SAC_A,
                supplyApy: 0.02,
                borrowApy: 0.1,
                utilization: 0.5,
                totalDepositsUsd: 2,
                totalBorrowsUsd: 1,
                availableLiquidityUsd: 1,
                usdPrice: 0,
              },
            ],
          })
    ) as unknown as typeof fetch
    const result = await createXoxnoHistory(
      createXoxnoClient({ fetch: fetcher })
    )({
      startTimestamp: Date.parse('2026-01-01T00:00:00Z') / 1000,
      endTimestamp: Date.parse('2026-01-02T00:00:00Z') / 1000,
      interval: 'DAY',
      targets,
    })
    expect(result.points).toHaveLength(1)
    expect(result.points[0].market.supplyAssetsUsd).toBeNull()
    expect(result.failures).toEqual([
      {
        productId: targets[1].productId,
        reason: expect.stringContaining('HTTP 429'),
      },
    ])
  })
})
