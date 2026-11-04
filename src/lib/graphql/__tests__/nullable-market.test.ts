import { createYoga } from 'graphql-yoga'
import { describe, expect, it, vi } from 'vitest'

const queryApy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/repositories/apy', () => ({
  queryApy,
  queryLatestApy: queryApy,
}))
vi.mock('@/lib/db/repositories/products', () => ({
  listAvailabilityPeriods: vi.fn(),
  queryProductFacets: vi.fn(),
  queryProducts: vi.fn(),
}))

const { schema } = await import('../schema')
const yoga = createYoga({ schema })

const product = {
  id: 'xoxno-pool',
  active: true,
  kind: 'supply',
  provider: 'xoxno',
  productType: 'pool',
  version: 'v1',
  protocolName: 'XOXNO',
  chainId: -1,
  chainName: 'stellar',
  assetSymbol: 'USDC',
  assetName: 'USD Coin',
  assetAddress: 'CUSD',
  assetDecimals: 7,
  protocolAddress: 'CPOOL',
  meta: {},
  collaterals: [
    {
      symbol: 'XLM',
      name: 'Stellar',
      address: 'CXLM',
      decimals: 7,
      ltv: null,
      lltv: null,
      canBeCollateral: false,
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('GraphQL unknown market data', () => {
  it.each([
    'supplyApyHourly',
    'borrowApyHourly',
    'supplyApyDaily',
    'borrowApyDaily',
  ])(
    '%s serializes a quoted net with unknown decomposition and market values',
    async (field) => {
      const row = {
        hour: new Date(),
        date: new Date(),
        apyBase: null,
        apyFees: null,
        apyNet: 0.05,
        apyRewards: 0,
        rewardItems: [],
        supplyAssets: null,
        supplyAssetsUsd: null,
        borrowAssets: null,
        borrowAssetsUsd: null,
        availableLiquidity: null,
        availableLiquidityUsd: null,
        utilizationRate: null,
        assetPriceUsd: null,
        collateralAssetsUsd: null,
        priceCollateralInLoanAsset: null,
        qualityCount: 1,
        qualityExpectedCount: 6,
        qualityFirstSlot: new Date(),
        qualityLastSlot: new Date(),
        qualityStatus: 'building',
      }
      queryApy.mockResolvedValue({
        rows: [{ row, product }],
        countTotal: 1,
        applied: { first: 100, skip: 0 },
      })
      const collateralFields = field.startsWith('borrow')
        ? 'collaterals { ltv lltv canBeCollateral }'
        : ''
      const response = await yoga.fetch(
        new Request('http://localhost/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: `{ ${field} { items { protocol ${collateralFields} apy { base fees rewards net } market { supplyAssets supplyAssetsUsd utilizationRate assetPriceUsd availableLiquidity availableLiquidityUsd } } } }`,
          }),
        })
      )
      const result = (await response.json()) as {
        errors?: unknown
        data?: Record<string, unknown>
      }
      expect(result.errors).toBeUndefined()
      expect(result.data?.[field]).toMatchObject({
        items: [
          {
            protocol: 'xoxno',
            ...(field.startsWith('borrow')
              ? {
                  collaterals: [
                    { ltv: null, lltv: null, canBeCollateral: false },
                  ],
                }
              : {}),
            apy: { base: null, fees: null, rewards: 0, net: 0.05 },
            market: {
              availableLiquidity: null,
              availableLiquidityUsd: null,
              supplyAssets: null,
            },
          },
        ],
      })
    }
  )
})
