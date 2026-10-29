import { describe, expect, it } from 'vitest'

import type { HistoryDataPoint, YieldAdapter } from '@/lib/protocols/core/types'
import { runReconcile } from '@/lib/reconcile'
import { adapterFamily, formatFamilies } from '@/lib/reconcile/families'
import type { ReconcileDeps } from '@/lib/reconcile/types'

const HOUR = 3600_000

function hoursAgo(n: number): Date {
  const d = new Date()
  d.setUTCMinutes(0, 0, 0)
  return new Date(d.getTime() - n * HOUR)
}

const GAP = hoursAgo(30)

function point(productId: string, hour: Date): HistoryDataPoint {
  return {
    timestamp: hour,
    productId,
    kind: 'supply',
    apy: { base: 0.05, rewards: 0, fees: 0, net: 0.05, rewardItems: [] },
    market: {
      supplyAssets: 1,
      supplyAssetsUsd: null,
      utilizationRate: 0.5,
      assetPriceUsd: null,
    },
  }
}

function adapter(
  over: Partial<YieldAdapter> & Pick<YieldAdapter, 'id' | 'provider' | 'chains'>
): YieldAdapter {
  return {
    name: over.id,
    version: 'v1',
    getProducts: async () => [],
    getApySpot: async () => [],
    ...over,
  }
}

const STELLAR = { [-1]: { slug: 'stellar' } }

const ADAPTERS: Record<string, YieldAdapter> = {
  aave_v3: adapter({
    id: 'aave_v3',
    provider: 'aave',
    chains: { 1: { slug: 'ethereum' } },
  }),
  'blend_v2.1': adapter({
    id: 'blend_v2.1',
    provider: 'blend',
    chains: STELLAR,
    getApyHistory: async () => ({
      points: [point('blend:y', GAP)],
      failures: [],
    }),
  }),
  stellar_fixture: adapter({
    id: 'stellar_fixture',
    provider: 'stellar',
    chains: STELLAR,
    getApyHistory: async () => ({ points: [point('fx:z', GAP)], failures: [] }),
  }),
}

const PROVIDER_OF: Record<string, string> = {
  'aave:x': 'aave',
  'blend:y': 'blend',
  'fx:z': 'stellar',
}

function donor(productId: string) {
  return {
    product_id: productId,
    hour: new Date(GAP.getTime() - HOUR).toISOString(),
    apy_base: 0.03,
    apy_rewards: 0,
    apy_fees: 0,
    apy_net: 0.03,
    reward_items: [],
  }
}

function makeDeps(
  over: Partial<ReconcileDeps> = {},
  adapters: Record<string, YieldAdapter> = ADAPTERS
): ReconcileDeps {
  return {
    findGaps: async () =>
      Object.keys(PROVIDER_OF).map((productId) => ({ productId, hour: GAP })),
    findIncomplete: async () => [],
    markStale: async () => 0,
    collectedProductCount: async () => 3,
    productProviders: async (ids) =>
      new Map(ids.map((id) => [id, PROVIDER_OF[id]])),
    historyTargets: async (ids) =>
      ids.map((id) => ({
        productId: id,
        chainId: 1,
        kind: 'supply' as const,
        meta: {},
      })),
    adapterIds: () => Object.keys(adapters),
    adapterIdsForProvider: (provider) =>
      Object.values(adapters)
        .filter((a) => a.provider === provider)
        .map((a) => a.id),
    loadAdapter: async (id) => adapters[id],
    fetchDonors: async () => [donor('aave:x')],
    writeHealed: async (rows) => rows.length,
    aggregateDaily: async () => 0,
    pruneHourly: async () => 0,
    countOrphans: async () => ({ hourly: 0, daily: 0 }),
    ...over,
  }
}

describe('adapterFamily', () => {
  it('reads the family from the chains an adapter declares', () => {
    expect(adapterFamily({ chains: { 1: { slug: 'ethereum' } } })).toBe('evm')
    expect(adapterFamily({ chains: STELLAR })).toBe('stellar')
    expect(adapterFamily({ chains: { [-2]: { slug: 'solana' } } })).toBe(
      'solana'
    )
  })

  it('has no single family for mixed, unregistered or no chains', () => {
    expect(
      adapterFamily({ chains: { 1: { slug: 'ethereum' }, ...STELLAR } })
    ).toBeNull()
    expect(
      adapterFamily({ chains: { ...STELLAR, [-2]: { slug: 'solana' } } })
    ).toBeNull()
    expect(
      adapterFamily({ chains: { 123456: { slug: 'nowhere' } } })
    ).toBeNull()
    expect(adapterFamily({ chains: {} })).toBeNull()
  })
})

describe('runReconcile — families', () => {
  it('counts each family separately: Stellar refetched from Hubble, EVM healed by a neighbour', async () => {
    const report = await runReconcile(makeDeps(), { days: 2, dryRun: false })

    expect(report.families.evm).toEqual({
      adapters: [{ id: 'aave_v3', provider: 'aave', hasHistory: false }],
      gaps: 1,
      repaired: { byRefetch: 0, byNeighbor: 1, noDonor: 0 },
      fetch: { requested: 1, returned: 0, failed: 0 },
    })
    expect(report.families.stellar).toEqual({
      adapters: [
        { id: 'blend_v2.1', provider: 'blend', hasHistory: true },
        { id: 'stellar_fixture', provider: 'stellar', hasHistory: true },
      ],
      gaps: 2,
      repaired: { byRefetch: 2, byNeighbor: 0, noDonor: 0 },
      fetch: { requested: 2, returned: 2, failed: 0 },
    })
    expect(report.success).toBe(true)
  })

  it('reports a refetch the Stellar adapter could not answer, then the neighbour that filled it', async () => {
    const adapters = {
      ...ADAPTERS,
      'blend_v2.1': adapter({
        id: 'blend_v2.1',
        provider: 'blend',
        chains: STELLAR,
        getApyHistory: async () => ({
          points: [],
          failures: [{ productId: 'blend:y', reason: 'over budget' }],
        }),
      }),
    }
    const report = await runReconcile(
      makeDeps(
        { fetchDonors: async () => [donor('aave:x'), donor('blend:y')] },
        adapters
      ),
      { days: 2, dryRun: false }
    )

    expect(report.families.stellar?.repaired).toEqual({
      byRefetch: 1,
      byNeighbor: 1,
      noDonor: 0,
    })
    expect(report.families.stellar?.fetch).toEqual({
      requested: 2,
      returned: 1,
      failed: 1,
    })
  })

  it('counts a history call that throws as failed for every product it was asked for', async () => {
    const adapters = {
      ...ADAPTERS,
      stellar_fixture: adapter({
        id: 'stellar_fixture',
        provider: 'stellar',
        chains: STELLAR,
        getApyHistory: async () => {
          throw new Error('Hubble down')
        },
      }),
    }
    const report = await runReconcile(makeDeps({}, adapters), {
      days: 2,
      dryRun: false,
    })

    expect(report.families.stellar?.fetch.failed).toBe(1)
    expect(report.families.stellar?.repaired.noDonor).toBe(1)
    expect(report.errors).toContain('stellar_fixture-history: Hubble down')
  })

  it('lists every family and its adapters on a night with no holes', async () => {
    const report = await runReconcile(makeDeps({ findGaps: async () => [] }), {
      days: 2,
      dryRun: false,
    })

    expect(report.families.evm?.gaps).toBe(0)
    expect(report.families.stellar?.gaps).toBe(0)
    expect(report.families.stellar?.adapters.map((a) => a.id)).toEqual([
      'blend_v2.1',
      'stellar_fixture',
    ])
  })

  it('reports families in a dry run too', async () => {
    const report = await runReconcile(makeDeps(), { days: 2, dryRun: true })
    expect(report.families.stellar?.repaired.byRefetch).toBe(2)
  })

  it('flags an adapter that declares no single chain family', async () => {
    const adapters = {
      ...ADAPTERS,
      mixed_v1: adapter({
        id: 'mixed_v1',
        provider: 'mixed',
        chains: { 1: { slug: 'ethereum' }, ...STELLAR },
      }),
    }
    const report = await runReconcile(makeDeps({}, adapters), {
      days: 2,
      dryRun: false,
    })

    expect(report.errors).toContain(
      'families: mixed_v1 declares no single chain family'
    )
    expect(report.success).toBe(false)
    expect(report.families.evm?.adapters.map((a) => a.id)).toEqual(['aave_v3'])
  })
})

describe('formatFamilies', () => {
  it('prints one line per family', async () => {
    const report = await runReconcile(makeDeps(), { days: 2, dryRun: false })
    const text = formatFamilies({
      id: 'r1',
      createdAt: new Date('2026-11-03T00:31:00Z'),
      payload: report,
    })

    expect(text).toContain('reconcile report r1 — 2026-11-03T00:31:00.000Z')
    expect(text).toMatch(/evm\s+1\s+0\s+1\s+0\s+1\/0\/0\s+aave_v3/)
    expect(text).toMatch(
      /stellar\s+2\s+2\s+0\s+0\s+2\/2\/0\s+blend_v2\.1 \(history\), stellar_fixture \(history\)/
    )
  })

  it('says so for a report written before families existed', () => {
    const text = formatFamilies({
      id: 'old',
      createdAt: new Date('2026-10-01T00:31:00Z'),
      payload: { success: true, window: 'w', dryRun: false },
    })
    expect(text).toContain('no family section')
  })
})
