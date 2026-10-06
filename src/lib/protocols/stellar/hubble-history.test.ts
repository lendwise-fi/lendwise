import { describe, expect, it } from 'vitest'

import {
  bucketStart,
  latestRowPerBucket,
  reconstructHubbleBuckets,
} from './hubble-history'

function ledgerRow({
  ledgerSequence,
  closedAt,
  key = 'reserve-a',
  val,
  deleted = false,
}: {
  ledgerSequence: number
  closedAt: string
  key?: string
  val: unknown
  deleted?: boolean
}) {
  return {
    contract_id: 'C1',
    ledger_sequence: ledgerSequence,
    closed_at: closedAt,
    ledger_key_hash: key,
    ledger_key_hash_base_64: null,
    key: null,
    val: null,
    key_decoded: null,
    val_decoded: val,
    contract_data_xdr: null,
    deleted,
  }
}

describe('stellar Hubble history helpers', () => {
  it('normalizes hourly and daily bucket starts in UTC', () => {
    const d = new Date('2026-08-29T14:37:12.000Z')
    expect(bucketStart(d, 'HOUR').toISOString()).toBe(
      '2026-08-29T14:00:00.000Z'
    )
    expect(bucketStart(d, 'DAY').toISOString()).toBe('2026-08-29T00:00:00.000Z')
  })

  it('keeps the latest ledger row inside each bucket', () => {
    const rows = [
      ledgerRow({
        ledgerSequence: 10,
        closedAt: '2026-08-29T14:05:00.000Z',
        key: 'old-key',
        val: { old: true },
      }),
      ledgerRow({
        ledgerSequence: 20,
        closedAt: '2026-08-29T14:55:00.000Z',
        key: 'new-key',
        val: { latest: true },
      }),
    ]

    const latest = latestRowPerBucket(rows, 'HOUR')
    expect(latest.size).toBe(1)
    expect(latest.get('2026-08-29T14:00:00.000Z')?.ledger_sequence).toBe(20)
  })

  it('carries ledger-entry state forward into buckets with no writes', () => {
    const buckets = reconstructHubbleBuckets({
      start: new Date('2026-08-29T10:00:00.000Z'),
      end: new Date('2026-08-29T13:00:00.000Z'),
      interval: 'HOUR',
      eventRows: [],
      ledgerRows: [
        ledgerRow({
          ledgerSequence: 10,
          closedAt: '2026-08-29T10:05:00.000Z',
          val: { supplyApr: 0.04 },
        }),
        ledgerRow({
          ledgerSequence: 20,
          closedAt: '2026-08-29T12:05:00.000Z',
          val: { supplyApr: 0.05 },
        }),
      ],
    })

    expect(buckets.map((b) => b.bucketStart.toISOString())).toEqual([
      '2026-08-29T10:00:00.000Z',
      '2026-08-29T11:00:00.000Z',
      '2026-08-29T12:00:00.000Z',
    ])
    expect(buckets[0].ledgerEntries[0]?.val_decoded).toEqual({
      supplyApr: 0.04,
    })
    expect(buckets[1].ledgerEntries[0]?.val_decoded).toEqual({
      supplyApr: 0.04,
    })
    expect(buckets[2].ledgerEntries[0]?.val_decoded).toEqual({
      supplyApr: 0.05,
    })
  })

  it('removes deleted ledger-entry keys from subsequent buckets', () => {
    const buckets = reconstructHubbleBuckets({
      start: new Date('2026-08-29T10:00:00.000Z'),
      end: new Date('2026-08-29T12:00:00.000Z'),
      interval: 'HOUR',
      eventRows: [],
      ledgerRows: [
        ledgerRow({
          ledgerSequence: 10,
          closedAt: '2026-08-29T10:05:00.000Z',
          val: { supplyApr: 0.04 },
        }),
        ledgerRow({
          ledgerSequence: 20,
          closedAt: '2026-08-29T11:05:00.000Z',
          val: null,
          deleted: true,
        }),
      ],
    })

    expect(buckets[0].ledgerEntries).toHaveLength(1)
    expect(buckets[1].ledgerEntries).toHaveLength(0)
  })
})
