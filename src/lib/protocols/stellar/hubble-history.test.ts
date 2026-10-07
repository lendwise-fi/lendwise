import type { BigQuery } from '@google-cloud/bigquery'
import { xdr } from '@stellar/stellar-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import fixedV2 from '@/lib/protocols/blend/common/__tests__/fixtures/fixed-v2-reserve.json'
import type { HistoryTarget } from '@/lib/protocols/core/types'

import {
  type HubbleContractDataRow,
  type StellarHistoryDecoder,
  bucketStart,
  bucketStarts,
  contractInstanceKey,
  fetchStellarHubbleHistory,
  ledgerKeyHash,
  reconstructBuckets,
} from './hubble-history'

const CONTRACT = fixedV2.poolId

/** A storage row whose value is the u32 `n`, under the symbol key `name`. */
function row(
  name: string,
  n: number,
  closedAt: string,
  seq: number,
  deleted = false
): HubbleContractDataRow {
  const entry = new xdr.ContractDataEntry({
    ext: new xdr.ExtensionPoint(0),
    contract: contractInstanceKey(CONTRACT).contractData().contract(),
    key: xdr.ScVal.scvSymbol(name),
    durability: xdr.ContractDataDurability.persistent(),
    val: xdr.ScVal.scvU32(n),
  })
  return {
    contract_id: CONTRACT,
    ledger_key_hash: `hash-${name}`,
    ledger_sequence: seq,
    closed_at: closedAt,
    contract_data_xdr: entry.toXDR('base64'),
    deleted,
  }
}

function valueOf(
  bucket: { state: ReadonlyMap<string, { val: xdr.ScVal }> },
  name: string
) {
  return bucket.state.get(`hash-${name}`)?.val.u32()
}

describe('buckets', () => {
  it('aligns hourly and daily bucket starts in UTC', () => {
    const at = new Date('2025-03-04T14:37:12.000Z')
    expect(bucketStart(at, 'HOUR').toISOString()).toBe(
      '2025-03-04T14:00:00.000Z'
    )
    expect(bucketStart(at, 'DAY').toISOString()).toBe(
      '2025-03-04T00:00:00.000Z'
    )
  })

  it('emits only buckets that have closed by the requested end', () => {
    const starts = bucketStarts({
      start: new Date('2025-03-04T10:30:00Z'),
      end: new Date('2025-03-04T13:15:00Z'),
      interval: 'HOUR',
    }).map((d) => d.toISOString())

    // 13:00–14:00 is still open at 13:15: never projected into the future.
    expect(starts).toEqual([
      '2025-03-04T10:00:00.000Z',
      '2025-03-04T11:00:00.000Z',
      '2025-03-04T12:00:00.000Z',
    ])
  })
})

describe('reconstructBuckets', () => {
  const window = {
    start: new Date('2025-03-04T10:00:00Z'),
    end: new Date('2025-03-04T14:00:00Z'),
    interval: 'HOUR' as const,
  }

  it('carries each key forward into buckets where nothing wrote it', () => {
    const buckets = reconstructBuckets({
      ...window,
      rows: [
        // seed: written long before the window
        row('Config', 7, '2024-06-01T00:00:00.000Z', 1),
        row('ResData', 1, '2025-03-04T10:05:00.000Z', 10),
        row('ResData', 2, '2025-03-04T12:40:00.000Z', 30),
      ],
    })

    expect(buckets.map((b) => valueOf(b, 'Config'))).toEqual([7, 7, 7, 7])
    expect(buckets.map((b) => valueOf(b, 'ResData'))).toEqual([1, 1, 2, 2])
  })

  it('keeps the last write inside a bucket, whatever the input order', () => {
    const [bucket] = reconstructBuckets({
      ...window,
      rows: [
        row('ResData', 3, '2025-03-04T10:50:00.000Z', 21),
        row('ResData', 1, '2025-03-04T10:10:00.000Z', 20),
      ],
    })
    expect(valueOf(bucket, 'ResData')).toBe(3)
  })

  it('drops a deleted key until it is written again', () => {
    const buckets = reconstructBuckets({
      ...window,
      rows: [
        row('Temp', 1, '2025-03-04T09:00:00.000Z', 1),
        row('Temp', 1, '2025-03-04T11:20:00.000Z', 2, true),
        row('Temp', 5, '2025-03-04T13:10:00.000Z', 3),
      ],
    })
    expect(buckets.map((b) => valueOf(b, 'Temp'))).toEqual([
      1,
      undefined,
      undefined,
      5,
    ])
  })
})

describe('ledgerKeyHash', () => {
  it('matches the key hash Hubble stores for a contract instance', () => {
    // The fixture's hashes come from the LedgerKey the RPC returned, so this
    // checks our own key construction + sha256(LedgerKey XDR), the formula
    // stellar-etl uses to fill `ledger_key_hash`.
    const hash = ledgerKeyHash(contractInstanceKey(CONTRACT))
    expect(fixedV2.rows.map((r) => r.ledger_key_hash)).toContain(hash)
  })
})

// ─── fetchStellarHubbleHistory against a fake BigQuery ────────────────────────

function fakeClient(rows: HubbleContractDataRow[] | Error) {
  const createQueryJob = vi.fn(async () => {
    if (rows instanceof Error) throw rows
    return [
      {
        metadata: { statistics: { totalBytesProcessed: '1073741824' } },
        getQueryResults: async () => [rows],
        getMetadata: async () => [
          { statistics: { query: { totalBytesBilled: '10485760' } } },
        ],
      },
    ]
  })
  return { client: { createQueryJob } as unknown as BigQuery, createQueryJob }
}

const decoder: StellarHistoryDecoder = {
  contractId: (t) => (t.meta.contract as string | undefined) ?? null,
  ledgerKeys: (id) => [contractInstanceKey(id)],
  decode: ({ target, bucket }) => {
    const v = valueOf(bucket, 'ResData')
    if (v === undefined) return []
    return [
      {
        timestamp: bucket.start,
        productId: target.productId,
        kind: 'supply',
        apy: { base: v, rewards: 0, fees: 0, net: v, rewardItems: [] },
        market: {
          supplyAssets: null,
          supplyAssetsUsd: null,
          utilizationRate: null,
          assetPriceUsd: null,
        },
      },
    ]
  },
}

const targets: HistoryTarget[] = [
  {
    productId: 'p1',
    chainId: -1,
    kind: 'supply',
    meta: { contract: CONTRACT },
  },
  { productId: 'p2', chainId: -1, kind: 'supply', meta: {} },
]

const params = {
  startTimestamp: Date.parse('2025-03-04T10:00:00Z') / 1000,
  endTimestamp: Date.parse('2025-03-04T13:00:00Z') / 1000,
  interval: 'HOUR' as const,
  decoder,
  onProgress: () => {},
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('fetchStellarHubbleHistory', () => {
  it('fetches only the decoder keys, bounded by a byte budget', async () => {
    const { client, createQueryJob } = fakeClient([])
    await fetchStellarHubbleHistory({ ...params, client, targets })

    const job = (createQueryJob.mock.calls as unknown[][])[0][0] as {
      params: Record<string, unknown>
      maximumBytesBilled: string
    }
    expect(job.params.contract_ids).toEqual([CONTRACT])
    expect(job.params.key_hashes).toEqual([
      ledgerKeyHash(contractInstanceKey(CONTRACT)),
    ])
    expect(Number(job.maximumBytesBilled)).toBeGreaterThan(0)
    // events are opt-in: one query, not two
    expect(createQueryJob).toHaveBeenCalledTimes(1)
  })

  it('returns one point per complete bucket and names unlocatable products', async () => {
    const { client } = fakeClient([
      row('ResData', 4, '2025-03-04T09:00:00.000Z', 1),
    ])
    const result = await fetchStellarHubbleHistory({
      ...params,
      client,
      targets,
    })

    expect(result.points.map((p) => p.timestamp.toISOString())).toEqual([
      '2025-03-04T10:00:00.000Z',
      '2025-03-04T11:00:00.000Z',
      '2025-03-04T12:00:00.000Z',
    ])
    expect(result.failures).toEqual([
      { productId: 'p2', reason: 'no Soroban contract id in target meta' },
    ])
  })

  it('reports a product with no state at all as a failure', async () => {
    const { client } = fakeClient([])
    const result = await fetchStellarHubbleHistory({
      ...params,
      client,
      targets: [targets[0]],
    })
    expect(result.points).toEqual([])
    expect(result.failures[0].productId).toBe('p1')
  })

  it('fails only the product whose storage cannot be decoded', async () => {
    const { client } = fakeClient([
      row('ResData', 4, '2025-03-04T09:00:00.000Z', 1),
    ])
    const result = await fetchStellarHubbleHistory({
      ...params,
      client,
      targets: [targets[0], { ...targets[0], productId: 'p3' }],
      decoder: {
        ...decoder,
        decode: (ctx) => {
          if (ctx.target.productId === 'p3') throw new Error('unknown key')
          return decoder.decode(ctx)
        },
      },
    })

    expect(result.points).toHaveLength(3)
    expect(result.failures).toEqual([
      { productId: 'p3', reason: 'decode failed: unknown key' },
    ])
  })

  it('fails soft when BigQuery refuses the job (e.g. over budget)', async () => {
    const { client } = fakeClient(
      new Error('Query exceeded limit for bytes billed')
    )
    const result = await fetchStellarHubbleHistory({
      ...params,
      client,
      targets: [targets[0]],
    })
    expect(result.points).toEqual([])
    expect(result.failures[0].reason).toContain('bytes billed')
  })

  it('prices the call without running it under HUBBLE_DRY_RUN', async () => {
    vi.stubEnv('HUBBLE_DRY_RUN', '1')
    const { client, createQueryJob } = fakeClient([
      row('ResData', 4, '2025-03-04T09:00:00.000Z', 1),
    ])
    const log = vi.fn()
    const result = await fetchStellarHubbleHistory({
      ...params,
      client,
      targets: [targets[0]],
      onProgress: log,
    })

    expect(
      ((createQueryJob.mock.calls as unknown[][])[0][0] as { dryRun: boolean })
        .dryRun
    ).toBe(true)
    expect(result).toEqual({ points: [], failures: [] })
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('would process 1.00 GB')
    )
  })
})
