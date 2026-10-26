import { beforeEach, describe, expect, it, vi } from 'vitest'

import { aprToApyPerSecond } from '@/lib/utils'

/**
 * Spot fetcher tests for Compound V3.
 *
 * Each chain is queried through its own subgraph client. The fetcher must
 * return exactly one supply and one borrow payload per market, whatever the
 * number of chains, and store amounts in whole tokens.
 */

type Market = {
  id: string
  symbol: string
  decimals: number | null
  totalBaseSupply: string
  totalBaseBorrow: string
}

// Subgraph URL → markets that chain's subgraph returns.
let marketsByUrl: Record<string, Market[]> = {}
let failingUrls = new Set<string>()

function toGraph(m: Market) {
  return {
    id: m.id,
    configuration: {
      symbol: m.symbol,
      baseToken: {
        lastPriceUsd: '1',
        token: m.decimals == null ? null : { decimals: m.decimals },
      },
    },
    accounting: {
      supplyApr: '0.05',
      netSupplyApr: '0.06',
      rewardSupplyApr: '0.01',
      totalBaseSupply: m.totalBaseSupply,
      totalBaseSupplyUsd: '1000',
      borrowApr: '0.09',
      netBorrowApr: '0.08',
      rewardBorrowApr: '0.01',
      totalBaseBorrow: m.totalBaseBorrow,
      totalBaseBorrowUsd: '500',
      utilization: '0.5',
      collateralBalanceUsd: '2000',
    },
  }
}

vi.mock('@/lib/protocols/core/toolkit', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/protocols/core/toolkit')>()
  return {
    ...actual,
    createGraphQLClient: (url: string) => ({
      query: () => ({
        toPromise: async () =>
          failingUrls.has(url)
            ? { data: undefined, error: { message: 'subgraph down' } }
            : {
                data: { markets: (marketsByUrl[url] ?? []).map(toGraph) },
                error: undefined,
              },
      }),
    }),
  }
})

async function load() {
  const { COMPOUND_V3_CHAINS } =
    await import('@/lib/protocols/compound/v3/config')
  const { fetchCompoundV3ApySpot } =
    await import('@/lib/protocols/compound/v3/apy-spot')
  const url = (chainId: number) =>
    COMPOUND_V3_CHAINS[chainId].custom.subgraphUrl
  return { fetchCompoundV3ApySpot, url }
}

const USDC_ETH: Market = {
  id: '0xc3d688b66703497daa19211eedff47f25384cdc3',
  symbol: 'USDC',
  decimals: 6,
  totalBaseSupply: '2500000000', // 2,500 USDC
  totalBaseBorrow: '1000000000', // 1,000 USDC
}
const WETH_ETH: Market = {
  id: '0xa17581a9e3356d9a858b789d68b4d866e593ae94',
  symbol: 'WETH',
  decimals: 18,
  totalBaseSupply: '3000000000000000000', // 3 WETH
  totalBaseBorrow: '1500000000000000000', // 1.5 WETH
}
const USDC_BASE: Market = {
  id: '0xb125e6687d4313864e53df431d5425969c15eb2f',
  symbol: 'USDC',
  decimals: 6,
  totalBaseSupply: '7000000',
  totalBaseBorrow: '3000000',
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  marketsByUrl = {}
  failingUrls = new Set()
})

describe('fetchCompoundV3ApySpot', () => {
  it('returns one supply and one borrow payload per market across several chains', async () => {
    const { fetchCompoundV3ApySpot, url } = await load()
    marketsByUrl[url(1)] = [USDC_ETH, WETH_ETH]
    marketsByUrl[url(8453)] = [USDC_BASE]

    const payloads = await fetchCompoundV3ApySpot({ chainIds: [1, 8453] })

    expect(payloads).toHaveLength(6)
    const ids = payloads.map((p) => p.productId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(payloads.filter((p) => p.kind === 'supply')).toHaveLength(3)
    expect(payloads.filter((p) => p.kind === 'borrow')).toHaveLength(3)
  })

  it('does not duplicate payloads when every chain answers', async () => {
    const { fetchCompoundV3ApySpot, url } = await load()
    for (const chainId of [1, 137, 42161, 8453, 10]) {
      marketsByUrl[url(chainId)] = [
        { ...USDC_ETH, id: `0x${chainId.toString(16).padStart(40, '0')}` },
      ]
    }

    const payloads = await fetchCompoundV3ApySpot()

    // 5 chains × 1 market × (supply + borrow)
    expect(payloads).toHaveLength(10)
    expect(new Set(payloads.map((p) => p.productId)).size).toBe(10)
  })

  it('stores amounts in whole tokens using the base token decimals', async () => {
    const { fetchCompoundV3ApySpot, url } = await load()
    marketsByUrl[url(1)] = [USDC_ETH, WETH_ETH]

    const payloads = await fetchCompoundV3ApySpot({ chainIds: [1] })
    const borrow = (symbol: string) =>
      payloads.find((p) => p.kind === 'borrow' && p.asset === symbol)!
        .market as unknown as Record<string, number | null>

    expect(borrow('USDC').supplyAssets).toBe(2500)
    expect(borrow('USDC').borrowAssets).toBe(1000)
    expect(borrow('WETH').supplyAssets).toBe(3)
    expect(borrow('WETH').borrowAssets).toBe(1.5)
    expect(borrow('USDC').priceCollateralInLoanAsset).toBeNull()
  })

  it('leaves amounts untouched when decimals are unknown', async () => {
    const { fetchCompoundV3ApySpot, url } = await load()
    marketsByUrl[url(1)] = [{ ...USDC_ETH, decimals: null }]

    const payloads = await fetchCompoundV3ApySpot({ chainIds: [1] })
    const supply = payloads.find((p) => p.kind === 'supply')!
      .market as unknown as Record<string, number>

    expect(supply.supplyAssets).toBe(2_500_000_000)
  })

  it('stores the per-second APR the subgraph reports as APY', async () => {
    // The subgraph's `supplyApr`/`borrowApr` are Comet's per-second rate times
    // seconds per year: an APR. Rates are stored as APY, so the base rate is
    // compounded per second; reward APRs stay linear, as for Morpho.
    const { fetchCompoundV3ApySpot, url } = await load()
    marketsByUrl[url(1)] = [USDC_ETH]

    const payloads = await fetchCompoundV3ApySpot({ chainIds: [1] })
    const apy = (kind: 'supply' | 'borrow') =>
      payloads.find((p) => p.kind === kind)!.apy

    expect(apy('supply').base).toBeCloseTo(aprToApyPerSecond(0.05), 12)
    expect(apy('supply').rewards).toBe(0.01)
    expect(apy('supply').net).toBeCloseTo(aprToApyPerSecond(0.05) + 0.01, 12)
    expect(apy('borrow').base).toBeCloseTo(aprToApyPerSecond(0.09), 12)
    expect(apy('borrow').rewards).toBe(0.01)
    expect(apy('borrow').net).toBeCloseTo(aprToApyPerSecond(0.09) - 0.01, 12)
  })

  it('throws with the failing chain when a subgraph errors', async () => {
    const { fetchCompoundV3ApySpot, url } = await load()
    marketsByUrl[url(1)] = [USDC_ETH]
    failingUrls.add(url(8453))

    await expect(
      fetchCompoundV3ApySpot({ chainIds: [1, 8453] })
    ).rejects.toThrow(/subgraph down/)
  })
})
