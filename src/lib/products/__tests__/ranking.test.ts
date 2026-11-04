import { describe, expect, it } from 'vitest'

import { DEFAULT_SUPPLY_FILTERS } from '@/config/table-filters'
import { lastObservation } from '@/lib/db/last-observation'
import { productToRow } from '@/lib/db/product-row'
import type { CatalogueRow } from '@/lib/db/types'
import { bridgeHref } from '@/lib/execution/cctp/deep-link'
import { toSupplyProduct } from '@/lib/products/from-catalogue'
import {
  chainFamilyOfProduct,
  productEntry,
  rankProducts,
} from '@/lib/products/ranking'
import {
  FIXTURE_YIELD_PRODUCT_ID,
  stellarFixtureYieldAdapter,
} from '@/lib/protocols/stellar/fixture/yield'
import { matchesFilters } from '@/lib/table-filters'
import type { SupplyProduct } from '@/types'

const now = new Date('2026-11-02T10:00:00Z')

/** An EVM catalogue row, the shape `latestForTable` returns. */
function evmRow(
  product: Partial<CatalogueRow['product']>,
  apyNet: number,
  supplyUsd: number
): CatalogueRow {
  return {
    product: {
      id: 'x',
      active: true,
      kind: 'supply',
      provider: 'aave',
      productType: 'reserve',
      version: 'v3',
      protocolName: 'AaveV3Ethereum',
      chainId: 1,
      chainName: 'Ethereum',
      assetSymbol: 'USDC',
      assetName: 'USD Coin',
      assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      assetDecimals: 6,
      protocolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      subgraphUrl: null,
      meta: {},
      collaterals: null,
      createdAt: now,
      updatedAt: now,
      ...product,
    },
    hour: now,
    apyNet,
    apyRewards: 0,
    supplyAssets: supplyUsd,
    supplyAssetsUsd: supplyUsd,
    borrowAssets: null,
    borrowAssetsUsd: null,
    collateralAssetsUsd: null,
    utilizationRate: 0.7,
    availableLiquidity: supplyUsd - supplyUsd * 0.7,
    availableLiquidityUsd: supplyUsd - supplyUsd * 0.7,
    assetPriceUsd: 1,
  }
}

/**
 * The fixture adapter's own product and spot, through the mapping the pipeline
 * stores (`productToRow`) and the one the table reads (`toSupplyProduct`).
 */
async function fixtureRow(
  over: Partial<CatalogueRow> = {}
): Promise<CatalogueRow> {
  const [product] = await stellarFixtureYieldAdapter.getProducts()
  const [spot] = await stellarFixtureYieldAdapter.getApySpot()
  const market = spot.market as {
    supplyAssets: number | null
    supplyAssetsUsd: number | null
    utilizationRate: number | null
    assetPriceUsd: number | null
  }
  return {
    product: productToRow(product),
    hour: now,
    apyNet: spot.apy.net,
    apyRewards: spot.apy.rewards,
    supplyAssets: market.supplyAssets,
    supplyAssetsUsd: market.supplyAssetsUsd,
    borrowAssets: null,
    borrowAssetsUsd: null,
    collateralAssetsUsd: null,
    utilizationRate: market.utilizationRate,
    assetPriceUsd: market.assetPriceUsd,
    availableLiquidity: lastObservation(spot).availableLiquidity,
    availableLiquidityUsd: lastObservation(spot).availableLiquidityUsd,
    ...over,
  }
}

const AAVE_BASE = evmRow(
  {
    id: 'aave:v3:base:reserve:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:supply',
    protocolName: 'AaveV3Base',
    chainId: 8453,
    chainName: 'Base',
    assetAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  0.052,
  50_000_000
)
const MORPHO_ETH = evmRow(
  {
    id: 'morpho:v1:ethereum:vault:0xbeef01735c132ada46aa9aa4c54623caa92a64cb:supply',
    provider: 'morpho',
    productType: 'vault',
    version: 'v1',
    protocolName: 'MorphoBlueEthereum',
    protocolAddress: '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB',
    meta: { name: 'Steakhouse USDC' },
  },
  0.081,
  30_000_000
)
const COMPOUND_ARB = evmRow(
  {
    id: 'compoundcomet:v3:arbitrum:market:0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf:supply',
    provider: 'compound',
    productType: 'market',
    protocolName: 'CompoundV3Arbitrum',
    chainId: 42161,
    chainName: 'Arbitrum',
    assetAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    protocolAddress: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
  },
  0.043,
  20_000_000
)

const rank = (rows: SupplyProduct[]) =>
  rankProducts(rows, {
    apyKey: 'apy',
    tvlKey: 'assetAmountUsd',
    idKey: 'productId',
  })

describe('ranking — a Stellar adapter next to Aave, Morpho and Compound', () => {
  it('ranks the fixture by its rate among the EVM markets of the same asset', async () => {
    const rows = [AAVE_BASE, MORPHO_ETH, COMPOUND_ARB, await fixtureRow()].map(
      (r) => toSupplyProduct(r)
    )

    expect(rank(rows).map((p) => p.protocol)).toEqual([
      'morpho_v1', // 8.1 %
      'stellar_fixture', // 7.5 %
      'aave_v3', // 5.2 %
      'compound_v3', // 4.3 %
    ])
  })

  it('puts a Stellar market first when it pays the most — no family penalty', async () => {
    const rows = [
      toSupplyProduct(MORPHO_ETH),
      toSupplyProduct(await fixtureRow({ apyNet: 0.09 })),
    ]
    expect(rank(rows)[0].protocol).toBe('stellar_fixture')
  })

  it('passes the shipped display filters, so the table shows it', async () => {
    const fixture = toSupplyProduct(await fixtureRow())
    expect(matchesFilters(fixture, DEFAULT_SUPPLY_FILTERS, 'intraday')).toBe(
      true
    )
  })

  it('tags the fixture as Stellar with a bridge entry, the EVM rows with their protocol', async () => {
    const fixture = toSupplyProduct(await fixtureRow())
    expect(fixture.network).toBe('stellar')
    expect(chainFamilyOfProduct(fixture)).toBe('stellar')
    expect(productEntry(fixture)).toEqual({
      kind: 'bridge',
      href: bridgeHref({ productId: FIXTURE_YIELD_PRODUCT_ID }),
    })
    expect(productEntry(fixture)).toMatchObject({
      href: expect.stringContaining('product='),
    })

    for (const row of [AAVE_BASE, MORPHO_ETH, COMPOUND_ARB]) {
      const p = toSupplyProduct(row)
      expect(chainFamilyOfProduct(p)).toBe('evm')
      expect(productEntry(p)).toEqual({ kind: 'protocol' })
    }
  })

  it('keeps a non-USDC Stellar row on its protocol: CCTP only moves USDC', () => {
    expect(
      productEntry({ poolChainId: -1, assetSymbol: 'XLM', productId: 'p' })
    ).toEqual({ kind: 'protocol' })
  })
})

describe('rankProducts', () => {
  type Row = { id: string; apy?: number; tvl: number; apyMonthly?: number }
  const row = (id: string, apy: number | undefined, tvl = 0): Row => ({
    id,
    apy,
    tvl,
  })

  it('sorts by the rate, highest first by default, unmeasured rates last', () => {
    const rows = [row('a', 0.02), row('b', undefined), row('c', 0.05)]
    expect(
      rankProducts(rows, { apyKey: 'apy', idKey: 'id' }).map((r) => r.id)
    ).toEqual(['c', 'a', 'b'])
  })

  it('treats NaN as unmeasured', () => {
    const rows = [row('a', Number.NaN), row('b', 0.01)]
    expect(rankProducts(rows, { apyKey: 'apy' }).map((r) => r.id)).toEqual([
      'b',
      'a',
    ])
  })

  it('sorts cheapest first in ascending order, unmeasured still last', () => {
    const rows = [row('a', 0.05), row('b', undefined), row('c', 0.02)]
    expect(
      rankProducts(rows, { apyKey: 'apy', order: 'asc' }).map((r) => r.id)
    ).toEqual(['c', 'a', 'b'])
  })

  it('breaks a tie by depth, then by id', () => {
    const rows = [row('b', 0.03, 10), row('a', 0.03, 10), row('c', 0.03, 99)]
    expect(
      rankProducts(rows, { apyKey: 'apy', tvlKey: 'tvl', idKey: 'id' }).map(
        (r) => r.id
      )
    ).toEqual(['c', 'a', 'b'])
  })

  it('ranks on any horizon key', () => {
    const rows: Row[] = [
      { id: 'a', tvl: 0, apyMonthly: 0.01 },
      { id: 'b', tvl: 0, apyMonthly: 0.04 },
    ]
    expect(
      rankProducts(rows, { apyKey: 'apyMonthly' }).map((r) => r.id)
    ).toEqual(['b', 'a'])
  })

  it('does not reorder its input', () => {
    const rows = [row('a', 0.01), row('b', 0.02)]
    rankProducts(rows, { apyKey: 'apy' })
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
