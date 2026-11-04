import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RAY, WAD } from '@/lib/protocols/xoxno/v1/capacity'
import { XOXNO_MAINNET } from '@/lib/protocols/xoxno/v1/config'
import { readXoxnoSnapshot } from '@/lib/protocols/xoxno/v1/rpc'
import { xoxnoProductId } from '@/lib/protocols/xoxno/v1/utils'
import type { BorrowProduct, SupplyProduct } from '@/types'

import { loadBorrowProducts, loadSupplyProducts } from '../products.actions'
import { optimizeWithXoxno } from '../xoxno-optimizer.actions'

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('../products.actions', () => ({
  loadSupplyProducts: vi.fn(),
  loadBorrowProducts: vi.fn(),
}))
vi.mock('@/lib/ratelimit', () => ({
  clientIp: () => 'test',
  optimizerLimiter: { limit: async () => ({ success: true }) },
}))
vi.mock('@/lib/protocols/xoxno/v1/rpc', () => ({
  VERIFICATION_WINDOW_MS: 30000,
  readXoxnoSnapshot: vi.fn(),
}))

const asset = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
const meta = {
  ...XOXNO_MAINNET,
  asset,
  hubId: 1,
  hubName: 'Hub',
  historySpokeId: 1,
  logoUrl: null,
  spokes: [
    {
      spokeId: 1,
      spokeName: 'General',
      canSupply: true,
      canBeCollateral: true,
      canBorrow: true,
      canOpenAccount: true,
      supplyCapacity: null,
      borrowCapacity: null,
      ltv: 0.75,
      lltv: 0.8,
      paused: false,
      frozen: false,
      noSeize: false,
      collaterals: [],
    },
  ],
}
const productId = xoxnoProductId({ ...meta, kind: 'supply' })
const row = {
  protocol: 'xoxno_v1',
  productId,
  poolName: 'Hub',
  assetAddress: asset,
  assetSymbol: 'USDC',
  assetDecimals: 7,
  apy: 0.05,
  xoxno: meta,
} as unknown as SupplyProduct
const siblingMeta = { ...meta, hubId: 2 }
const siblingId = xoxnoProductId({ ...siblingMeta, kind: 'supply' })
const siblingRow = {
  ...row,
  productId: siblingId,
  poolName: 'Sibling hub',
  apyMonthly: 0.07,
  xoxno: siblingMeta,
}
const legacyRow: SupplyProduct = {
  ...row,
  protocol: 'aave_v3',
  productId: 'legacy',
  poolName: 'Legacy',
  apyMonthly: 0.03,
  xoxno: undefined,
}
const input = {
  kind: 'supply' as const,
  amount: '100',
  horizon: 'intraday' as const,
  markets: [{ productId, selection: { spokeId: 1 } }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPTIMIZER_API_URL', 'https://solver.invalid')
  vi.mocked(loadSupplyProducts).mockResolvedValue([row])
  vi.mocked(readXoxnoSnapshot).mockImplementation(
    async (selections, startedAt = Date.now()) => ({
      startedAt,
      observedAt: new Date(startedAt).toISOString(),
      minLedger: 100,
      maxLedger: 101,
      minCollateralUsd: WAD,
      markets: selections.map(({ productId, meta, selection }) => ({
        productId,
        spokeId: selection.spokeId,
        debt: {
          key: `${meta.hubId}:${selection.spokeId}:${meta.asset}`,
          hubId: meta.hubId,
          asset: meta.asset,
          market: {
            decimals: 7,
            cash: 1000n * 10n ** 7n,
            supplied: 1000n * RAY,
            borrowed: 0n,
            storedSupplyIndex: RAY,
            storedBorrowIndex: RAY,
            supplyIndex: RAY,
            borrowIndex: RAY,
            maxUtilization: RAY,
            price: WAD,
          },
          listing: {
            supplied: 1000n * RAY,
            borrowed: 0n,
            supplyCap: 2000n * 10n ** 7n,
            borrowCap: 2000n * 10n ** 7n,
            collateral: true,
            borrowable: true,
            ltv: 7500,
            threshold: 8000,
            paused: false,
            frozen: false,
          },
        },
      })),
    })
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        success: true,
        allocations: [
          { vault_index: 0, allocation: 1, allocation_percent: 100 },
        ],
        resulting_diversification: 0,
      })
    )
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('server-owned XOXNO recommendation', () => {
  it('reloads catalogue identity and qualifies immediately around the solver', async () => {
    const result = await optimizeWithXoxno(input)
    expect(result.success).toBe(true)
    if (result.success) expect(result.qualification.minLedger).toBe(100)
    expect(readXoxnoSnapshot).toHaveBeenCalledWith(
      [
        {
          productId,
          meta: expect.objectContaining({
            controller: meta.controller,
            hubId: 1,
            asset,
          }),
          selection: { spokeId: 1 },
        },
      ],
      expect.any(Number)
    )
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('rejects forged market, missing variant, existing account and oversized input before RPC', async () => {
    for (const request of [
      {
        ...input,
        markets: [{ productId: 'forged', selection: { spokeId: 1 } }],
      },
      { ...input, markets: [{ productId }] },
      {
        ...input,
        markets: [{ productId, selection: { spokeId: 1, accountId: '5' } }],
      },
      { ...input, amount: '1'.repeat(65) },
    ])
      expect((await optimizeWithXoxno(request)).success).toBe(false)
    expect(readXoxnoSnapshot).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([undefined, NaN, Infinity, -Infinity])(
    'excludes an unavailable horizon (%s) before RPC or solver invocation',
    async (rate) => {
      vi.mocked(loadSupplyProducts).mockResolvedValue([
        { ...row, apyMonthly: rate },
      ])
      const result = await optimizeWithXoxno({ ...input, horizon: 'medium' })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error).toBe('Hub: Selected horizon rate is unavailable')
      expect(readXoxnoSnapshot).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    }
  )
  it('accepts a finite zero rate without falling back to spot APY', async () => {
    vi.mocked(loadSupplyProducts).mockResolvedValue([{ ...row, apyMonthly: 0 }])
    const result = await optimizeWithXoxno({ ...input, horizon: 'medium' })
    expect(result.success).toBe(true)
    expect(readXoxnoSnapshot).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ apy: [0], diversification: 60 }),
      })
    )
  })
  it('qualifies only available XOXNO siblings and maps solver indexes to the original selection', async () => {
    vi.mocked(loadSupplyProducts).mockResolvedValue([
      row,
      legacyRow,
      siblingRow,
    ])
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        success: true,
        allocations: [
          { vault_index: 0, allocation: 0.25, allocation_percent: 25 },
          { vault_index: 1, allocation: 0.75, allocation_percent: 75 },
        ],
        resulting_diversification: 0,
      })
    )
    const result = await optimizeWithXoxno({
      ...input,
      horizon: 'medium',
      markets: [
        ...input.markets,
        { productId: 'legacy' },
        { productId: siblingId, selection: { spokeId: 1 } },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success && result.kind === 'supply') {
      expect(result.response.allocations.map((a) => a.vault_index)).toEqual([
        1, 2,
      ])
      expect(result.exclusions).toEqual([
        'Hub: Selected horizon rate is unavailable',
      ])
    }
    expect(readXoxnoSnapshot).toHaveBeenCalledWith(
      [expect.objectContaining({ productId: siblingId })],
      expect.any(Number)
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ apy: [0.03, 0.07], diversification: 60 }),
      })
    )
  })
  it('does not run legacy markets when all XOXNO horizon rates are unavailable', async () => {
    vi.mocked(loadSupplyProducts).mockResolvedValue([row, legacyRow])
    const result = await optimizeWithXoxno({
      ...input,
      horizon: 'medium',
      markets: [...input.markets, { productId: 'legacy' }],
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error).toBe('Hub: Selected horizon rate is unavailable')
    expect(readXoxnoSnapshot).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('excludes legacy markets that do not support the selected XOXNO collateral', async () => {
    const collateralAsset = `C${'A'.repeat(55)}`
    const collateral = {
      hubId: 2,
      asset: collateralAsset,
      symbol: 'XLM',
      name: 'Lumens',
      decimals: 7,
      logoUrl: null,
      ltv: 0.75,
      lltv: 0.8,
      canBeCollateral: true,
      canSupply: true,
      supplyCapacity: null,
      paused: false,
      frozen: false,
      noSeize: false,
    }
    const borrowMeta = {
      ...meta,
      spokes: [{ ...meta.spokes[0], collaterals: [collateral] }],
    }
    const borrowId = xoxnoProductId({ ...borrowMeta, kind: 'borrow' })
    const xoxnoBorrow: BorrowProduct = {
      ...row,
      productId: borrowId,
      xoxno: borrowMeta,
      collaterals: [],
    }
    const legacyBorrow: BorrowProduct = {
      ...legacyRow,
      liquidityAmountUsd: 1000,
      collaterals: [
        {
          address: 'WBTC',
          symbol: 'WBTC',
          name: 'Bitcoin',
          decimals: 8,
          ltv: 0.6,
          lltv: 0.65,
        },
      ],
    }
    vi.mocked(loadBorrowProducts).mockResolvedValue([xoxnoBorrow, legacyBorrow])
    const readSnapshot = vi.mocked(readXoxnoSnapshot).getMockImplementation()!
    vi.mocked(readXoxnoSnapshot).mockImplementationOnce(async (...args) => {
      const snapshot = await readSnapshot(...args)
      return {
        ...snapshot,
        markets: snapshot.markets.map((m) => ({
          ...m,
          collateral: {
            ...m.debt,
            key: `2:1:${collateralAsset}`,
            hubId: 2,
            asset: collateralAsset,
          },
        })),
      }
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        success: true,
        allocations: [{ market_index: 0, borrow: 50, collateral: 100 }],
        optimal_rate: 0.05,
        optimal_rate_percent: 5,
      })
    )
    const result = await optimizeWithXoxno({
      kind: 'borrow',
      amount: '100',
      horizon: 'intraday',
      collateralSymbol: 'XLM',
      markets: [
        {
          productId: borrowId,
          selection: { spokeId: 1, collateralHubId: 2, collateralAsset },
          recommendedLtv: 0.7,
        },
        { productId: 'legacy', recommendedLtv: 0.6 },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.exclusions).toEqual([
        'Legacy: Selected collateral is unavailable',
      ])
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).markets
        .max_ltv
    ).toHaveLength(1)
  })
  it('excludes an unqualified XOXNO sibling instead of treating it as a legacy market', async () => {
    vi.mocked(loadSupplyProducts).mockResolvedValue([row, siblingRow])
    const readSnapshot = vi.mocked(readXoxnoSnapshot).getMockImplementation()!
    vi.mocked(readXoxnoSnapshot).mockImplementationOnce(async (...args) => {
      const snapshot = await readSnapshot(...args)
      return { ...snapshot, markets: snapshot.markets.slice(0, 1) }
    })
    const result = await optimizeWithXoxno({
      ...input,
      markets: [
        ...input.markets,
        { productId: siblingId, selection: { spokeId: 1 } },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.exclusions).toEqual([
        'Sibling hub: XOXNO market was not RPC-qualified',
      ])
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ apy: [row.apy], diversification: 60 }),
      })
    )
  })
  it('rejects altered solver indexes and a snapshot stale at solver completion', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        success: true,
        allocations: [
          { vault_index: 10, allocation: 1, allocation_percent: 100 },
        ],
        resulting_diversification: 0,
      })
    )
    expect((await optimizeWithXoxno(input)).success).toBe(false)
    vi.mocked(fetch).mockImplementationOnce(async () => {
      vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 30000)
      return Response.json({
        success: true,
        allocations: [
          { vault_index: 0, allocation: 1, allocation_percent: 100 },
        ],
        resulting_diversification: 0,
      })
    })
    const stale = await optimizeWithXoxno(input)
    expect(stale.success).toBe(false)
    if (!stale.success) expect(stale.error).toContain('expired')
    vi.restoreAllMocks()
  })
})
