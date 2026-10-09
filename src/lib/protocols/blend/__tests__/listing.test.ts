import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `blendPoolIds` is THE enumeration predicate for both Blend callers. The known
 * set is injected by the pipeline via `opts.poolIds` (the `products` catalogue);
 * the on-chain reads — the backstop (reward zone, factory id) and the factory
 * Deploy scan — are the only things mocked here; the union / dedup / sort is
 * really computed.
 */

const mocks = vi.hoisted(() => ({
  getBackstop: vi.fn(),
  getFactoryDeployedPools: vi.fn(),
}))

vi.mock('@/lib/protocols/blend/common/api', () => ({
  getBackstop: mocks.getBackstop,
  getFactoryDeployedPools: mocks.getFactoryDeployedPools,
}))

const { blendPoolIds } = await import('@/lib/protocols/blend/listing')
const { BLEND_DEPLOYMENTS } =
  await import('@/lib/protocols/blend/common/deployments')
const V1 = BLEND_DEPLOYMENTS.v1
const V2 = BLEND_DEPLOYMENTS.v2
const V2_1 = BLEND_DEPLOYMENTS['v2.1']
const FACTORY = `C${'F'.repeat(55)}`

/** The backstop's config: its factory, and the pools in its reward zone. */
function backstopWith(rewardZone: string[] = []) {
  mocks.getBackstop.mockResolvedValue({
    config: { poolFactory: FACTORY, rewardZone },
  })
}

// Synthetic strkey-shaped ids (56 chars, leading `C`). Distinct and
// case-convertible; none is a real pool.
const KNOWN_A = `C${'A'.repeat(55)}`
const KNOWN_B = `C${'B'.repeat(55)}`
const EVENT_C = `C${'C'.repeat(55)}`
const EVENT_D = `C${'D'.repeat(55)}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  backstopWith()
})

describe('blendPoolIds — catalogue mode (getProducts)', () => {
  it('unions the known set with the factory scan, deduped and sorted', async () => {
    mocks.getFactoryDeployedPools.mockResolvedValue([EVENT_C, EVENT_D])

    const result = await blendPoolIds(
      V2,
      { poolIds: [KNOWN_B, KNOWN_A] },
      'catalogue'
    )

    expect(result).toEqual([KNOWN_A, KNOWN_B, EVENT_C, EVENT_D])
    expect(mocks.getFactoryDeployedPools).toHaveBeenCalledWith(FACTORY)
  })

  it('collapses a pool that appears in both terms', async () => {
    mocks.getFactoryDeployedPools.mockResolvedValue([KNOWN_B, EVENT_C])

    const result = await blendPoolIds(
      V1,
      { poolIds: [KNOWN_A, KNOWN_B] },
      'catalogue'
    )

    expect(result).toEqual([KNOWN_A, KNOWN_B, EVENT_C])
    expect(new Set(result).size).toBe(result.length)
  })

  it('upcases a lowercase address from either term, exactly once', async () => {
    mocks.getFactoryDeployedPools.mockResolvedValue([EVENT_C.toLowerCase()])

    const result = await blendPoolIds(
      V2,
      { poolIds: [KNOWN_A.toLowerCase(), KNOWN_A] },
      'catalogue'
    )

    expect(result).toEqual([EVENT_C, KNOWN_A].sort())
    expect(result).not.toContain(KNOWN_A.toLowerCase())
    expect(result).not.toContain(EVENT_C.toLowerCase())
  })

  it('warns and falls back to the known set when the factory scan rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.getFactoryDeployedPools.mockRejectedValue(new Error('429'))

    const result = await blendPoolIds(V1, { poolIds: [KNOWN_A] }, 'catalogue')

    expect(result).toEqual([KNOWN_A])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[pools:blend_v1] getEvents skipped: 429')
    )
  })

  it('returns [] when the known set is empty and the factory scan is empty', async () => {
    mocks.getFactoryDeployedPools.mockResolvedValue([])

    expect(await blendPoolIds(V2, undefined, 'catalogue')).toEqual([])
    expect(await blendPoolIds(V2, { poolIds: [] }, 'catalogue')).toEqual([])
  })

  it('lets the factory scan add a pool absent from the known set', async () => {
    mocks.getFactoryDeployedPools.mockResolvedValue([EVENT_C])

    expect(await blendPoolIds(V1, { poolIds: [] }, 'catalogue')).toEqual([
      EVENT_C,
    ])
  })

  it('seeds from the reward zone a deployment the catalogue has never seen', async () => {
    backstopWith([EVENT_D])
    mocks.getFactoryDeployedPools.mockResolvedValue([])

    expect(await blendPoolIds(V2_1, undefined, 'catalogue')).toEqual([EVENT_D])
    expect(mocks.getBackstop).toHaveBeenCalledWith({ deployment: V2_1 })
  })

  it('keeps the known set when the backstop cannot be read, without scanning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.getBackstop.mockRejectedValue(new Error('fetch failed'))

    expect(
      await blendPoolIds(V2_1, { poolIds: [KNOWN_A] }, 'catalogue')
    ).toEqual([KNOWN_A])
    expect(mocks.getFactoryDeployedPools).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[pools:blend_v2.1] backstop skipped: fetch failed'
      )
    )
  })

  it('returns a stable ascending sort regardless of input order', async () => {
    mocks.getFactoryDeployedPools.mockResolvedValue([EVENT_C])

    expect(
      await blendPoolIds(V2, { poolIds: [EVENT_D, KNOWN_A] }, 'catalogue')
    ).toEqual([KNOWN_A, EVENT_C, EVENT_D].sort())
  })
})

describe('blendPoolIds — spot mode (getApySpot)', () => {
  it('returns the known set deduped and sorted, without calling the factory', async () => {
    const result = await blendPoolIds(
      V2,
      { poolIds: [KNOWN_B, KNOWN_A, KNOWN_B] },
      'spot'
    )

    expect(result).toEqual([KNOWN_A, KNOWN_B])
    expect(mocks.getBackstop).not.toHaveBeenCalled()
    expect(mocks.getFactoryDeployedPools).not.toHaveBeenCalled()
  })

  it('returns [] for an empty / absent known set', async () => {
    expect(await blendPoolIds(V1, { poolIds: [] }, 'spot')).toEqual([])
    expect(await blendPoolIds(V1, undefined, 'spot')).toEqual([])
    expect(mocks.getFactoryDeployedPools).not.toHaveBeenCalled()
  })
})
