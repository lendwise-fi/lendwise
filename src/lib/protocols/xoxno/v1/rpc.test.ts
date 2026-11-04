import {
  Account,
  Address,
  Networks,
  Transaction,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { RAY, WAD } from './capacity'
import { XOXNO_MAINNET } from './config'
import { type RpcSelection, readXoxnoSnapshot } from './rpc'

vi.mock('server-only', () => ({}))
vi.mock('@/config/rpc.server', () => ({ serverRpc: () => null }))
vi.mock('@/lib/net/paced-queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/net/paced-queue')>()
  return {
    createPacedQueue: (
      options: Parameters<typeof actual.createPacedQueue>[0]
    ) => actual.createPacedQueue({ ...options, now: () => Date.now() }),
  }
})

const asset = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
const selection: RpcSelection = {
  productId: 'test',
  meta: {
    ...XOXNO_MAINNET,
    hubId: 1,
    asset,
    hubName: 'Hub',
    historySpokeId: 1,
    logoUrl: null,
    spokes: [],
  },
  selection: { spokeId: 1 },
}
const borrowSelection: RpcSelection = {
  ...selection,
  selection: {
    spokeId: 1,
    collateralHubId: 2,
    collateralAsset: XOXNO_MAINNET.nft,
  },
}
const contractData = (key: xdr.ScVal, value: xdr.ScVal) =>
  xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: new xdr.ExtensionPoint(0),
      contract: new Address(XOXNO_MAINNET.controller).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent(),
      val: value,
    })
  ).toXDR('base64')
function mockRpc(
  overrides: {
    paused?: boolean
    valid?: boolean
    hubActive?: boolean
    ledger?: number
    controllerPaused?: unknown
    latencyMs?: number
  } = {}
) {
  const methods: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, options: RequestInit) => {
      if (overrides.latencyMs)
        await new Promise((resolve) => setTimeout(resolve, overrides.latencyMs))
      const { method, params } = JSON.parse(options.body as string)
      const latestLedger = overrides.ledger ?? 123
      if (method === 'getLedgerEntries') {
        const key = xdr.LedgerKey.fromXDR(params.keys[0], 'base64')
          .contractData()
          .key()
        let value: xdr.ScVal
        if (key.switch().name === 'scvLedgerKeyContractInstance') {
          value = xdr.ScVal.scvContractInstance(
            new xdr.ScContractInstance({
              executable: xdr.ContractExecutable.contractExecutableWasm(
                Buffer.alloc(32)
              ),
              storage: [
                new xdr.ScMapEntry({
                  key: xdr.ScVal.scvVec([
                    xdr.ScVal.scvSymbol('PositionLimits'),
                  ]),
                  val: nativeToScVal({
                    max_supply_positions: 10,
                    max_borrow_positions: 10,
                  }),
                }),
                ...('controllerPaused' in overrides
                  ? [
                      new xdr.ScMapEntry({
                        key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Paused')]),
                        val: nativeToScVal(overrides.controllerPaused),
                      }),
                    ]
                  : []),
              ],
            })
          )
        } else {
          expect(scValToNative(key)[0]).toBe('Hub')
          value = nativeToScVal({ is_active: overrides.hubActive ?? true })
        }
        return Response.json({
          result: {
            latestLedger,
            entries: [{ xdr: contractData(key, value) }],
          },
        })
      }
      expect(method).toBe('simulateTransaction')
      const tx = new Transaction(params.transaction, Networks.PUBLIC)
      const op = tx.operations[0]
      if (op.type !== 'invokeHostFunction')
        throw new Error('Unexpected operation')
      const invocation = op.func.invokeContract()
      const fn = invocation.functionName().toString()
      const args = invocation.args().map((arg) => scValToNative(arg))
      methods.push(fn)
      if (fn === 'get_sync_data' || fn === 'get_market_indexes_detailed') {
        const key =
          fn === 'get_sync_data'
            ? invocation.args()[0]
            : invocation.args()[0].vec()![0]
        expect(
          key
            .map()!
            .map((entry) => [
              entry.key().switch().name,
              entry.val().switch().name,
            ])
        ).toEqual([
          ['scvSymbol', 'scvAddress'],
          ['scvSymbol', 'scvU32'],
        ])
      }
      const values: Record<string, unknown> = {
        get_pool_address: new Address(XOXNO_MAINNET.pool).toScVal(),
        get_min_borrow_collateral_usd: WAD,
        get_market_indexes_detailed: (fn === 'get_market_indexes_detailed'
          ? args[0]
          : []
        ).map((key: { asset: string }) => ({
          asset: new Address(key.asset).toScVal(),
          supply_index: RAY,
          borrow_index: RAY,
          price_wad: WAD,
          primary_price_wad: WAD,
          anchor_price_wad: WAD,
          price_timestamp: 1n,
          stale: false,
          deviation: false,
          valid: overrides.valid ?? true,
          error_code: null,
        })),
        get_sync_data: {
          params: {
            asset_id: new Address(
              fn === 'get_sync_data' ? args[0].asset : asset
            ).toScVal(),
            asset_decimals: 7,
            max_utilization: RAY,
          },
          state: {
            supplied: 1000n * RAY,
            borrowed: 600n * RAY,
            revenue: 0n,
            supply_index: RAY,
            borrow_index: RAY,
            cash: 400n * 10n ** 7n,
            last_timestamp: 1n,
          },
        },
        get_spoke: { is_deprecated: false },
        get_spoke_asset: {
          is_collateralizable: true,
          is_borrowable: true,
          paused: overrides.paused ?? false,
          frozen: false,
          loan_to_value: 7500,
          liquidation_threshold: 8000,
          supply_cap: 2000n * 10n ** 7n,
          borrow_cap: 2000n * 10n ** 7n,
        },
        get_spoke_usage: {
          supplied_scaled_ray: 1000n * RAY,
          borrowed_scaled_ray: 600n * RAY,
        },
      }
      if (!(fn in values)) throw new Error(`Unexpected method ${fn}`)
      return Response.json({
        result: {
          latestLedger,
          results: [{ xdr: nativeToScVal(values[fn]).toXDR('base64') }],
        },
      })
    })
  )
  return methods
}

async function settle<T>(pending: Promise<T>): Promise<T> {
  const outcome = pending.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  )
  await vi.runAllTimersAsync()
  const result = await outcome
  if ('error' in result) throw result.error
  return result.value
}

// Keep one monotonic clock for the module-level paced queue.
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-04T00:00:00Z'))
})
afterEach(() => vi.unstubAllGlobals())
afterAll(() => vi.useRealTimers())
describe('raw contract RPC qualification', () => {
  it('decodes current Rust wire shapes, persistent Hub and instance PositionLimits', async () => {
    const methods = mockRpc()
    const result = await settle(readXoxnoSnapshot([selection]))
    expect(result.minLedger).toBe(123)
    expect(result.markets[0].debt.market.decimals).toBe(7)
    expect(result.markets[0].debt.listing.supplyCap).toBe(2000n * 10n ** 7n)
    expect(methods).toContain('get_market_indexes_detailed')
  })
  it('rejects unsafe oracle, halt flags, inactive hub and expired requests', async () => {
    for (const flags of [
      { valid: false },
      { paused: true },
      { hubActive: false },
    ]) {
      mockRpc(flags)
      await expect(settle(readXoxnoSnapshot([selection]))).rejects.toThrow()
    }
    mockRpc()
    await expect(
      settle(readXoxnoSnapshot([selection], Date.now() - 30_000))
    ).rejects.toThrow('expired')
  })
  it('accepts absent or false global pause and rejects true or malformed flags', async () => {
    mockRpc({ controllerPaused: false })
    await settle(readXoxnoSnapshot([selection]))
    expect(fetch).toHaveBeenCalledTimes(9)
    for (const controllerPaused of [true, 0, 'false', null]) {
      mockRpc({ controllerPaused })
      await expect(settle(readXoxnoSnapshot([selection]))).rejects.toThrow(
        controllerPaused === true ? 'controller is paused' : 'RPC flags'
      )
      expect(fetch).toHaveBeenCalledTimes(3)
    }
  })
  it('shares ten pending identical two-asset reads through the real paced queue only until settlement', async () => {
    mockRpc()
    await vi.advanceTimersByTimeAsync(250)
    const startedAt = Date.now()
    const snapshots = await settle(
      Promise.all(
        Array.from({ length: 10 }, () =>
          readXoxnoSnapshot([borrowSelection], startedAt)
        )
      )
    )
    expect(snapshots.every((snapshot) => snapshot === snapshots[0])).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(13)
    expect(Date.now() - startedAt).toBe(3_000)
    await settle(readXoxnoSnapshot([borrowSelection]))
    expect(fetch).toHaveBeenCalledTimes(26)
  })
  it.each([
    { productId: 'different-product' },
    { meta: { ...selection.meta, hubId: 3 } },
    { meta: { ...selection.meta, asset: XOXNO_MAINNET.controller } },
    { selection: { ...borrowSelection.selection, spokeId: 2 } },
    { selection: { ...borrowSelection.selection, collateralHubId: 3 } },
    {
      selection: {
        ...borrowSelection.selection,
        collateralAsset: XOXNO_MAINNET.pool,
      },
    },
  ])('keeps different selection identities separate: %j', async (change) => {
    mockRpc()
    const [first, second] = await settle(
      Promise.all([
        readXoxnoSnapshot([borrowSelection]),
        readXoxnoSnapshot([{ ...borrowSelection, ...change }]),
      ])
    )
    expect(first).not.toBe(second)
    expect(fetch).toHaveBeenCalledTimes(26)
  })
  it('preserves the first read timestamp when a later caller joins', async () => {
    mockRpc()
    const startedAt = Date.now() - 1_000
    const [first, later] = await settle(
      Promise.all([
        readXoxnoSnapshot([selection], startedAt),
        readXoxnoSnapshot([selection], Date.now()),
      ])
    )
    expect(later).toBe(first)
    expect(later.startedAt).toBe(startedAt)
    expect(later.observedAt).toBe(new Date(startedAt).toISOString())
    expect(fetch).toHaveBeenCalledTimes(9)
  })
  it('cannot extend the shared expiry with a later caller deadline', async () => {
    mockRpc({ latencyMs: 1_000 })
    const outcomes = await settle(
      Promise.allSettled([
        readXoxnoSnapshot([selection], Date.now() - 28_000),
        readXoxnoSnapshot([selection], Date.now()),
      ])
    )
    for (const result of outcomes) {
      expect(result.status).toBe('rejected')
      if (result.status === 'rejected')
        expect(result.reason.message).toContain('expired')
    }
    expect(fetch).toHaveBeenCalledTimes(2)
    mockRpc()
    await settle(readXoxnoSnapshot([selection]))
    expect(fetch).toHaveBeenCalledTimes(9)
  })
  it('enforces a joining caller deadline even when the shared read is fresh', async () => {
    mockRpc()
    const outcomes = await settle(
      Promise.allSettled([
        readXoxnoSnapshot([selection]),
        readXoxnoSnapshot([selection], Date.now() - 29_000),
        readXoxnoSnapshot([selection], Date.now() - 30_000),
      ])
    )
    expect(outcomes[0].status).toBe('fulfilled')
    for (const result of outcomes.slice(1)) {
      expect(result.status).toBe('rejected')
      if (result.status === 'rejected')
        expect(result.reason.message).toContain('expired')
    }
    expect(fetch).toHaveBeenCalledTimes(9)
  })
  it('refuses caller-selected contract deployments', async () => {
    mockRpc()
    await expect(
      readXoxnoSnapshot([
        {
          ...selection,
          meta: {
            ...selection.meta,
            controller: new Account(
              'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
              '0'
            ).accountId(),
          },
        },
      ])
    ).rejects.toThrow('Unsupported')
    expect(fetch).not.toHaveBeenCalled()
  })
})
