import { describe, expect, it } from 'vitest'

import { decodeBlendReserveHistoryState } from '../apy-history'

const ASSET = 'C' + 'A'.repeat(55)

function ledgerEntry({
  keyDecoded,
  valDecoded,
}: {
  keyDecoded: unknown
  valDecoded: unknown
}) {
  return {
    contract_id: 'C' + 'B'.repeat(55),
    ledger_sequence: 42,
    closed_at: '2026-08-29T14:30:00.000Z',
    ledger_key_hash: 'reserve-key',
    ledger_key_hash_base_64: null,
    key: null,
    val: null,
    key_decoded: keyDecoded,
    val_decoded: valDecoded,
    contract_data_xdr: null,
    deleted: false,
  }
}

describe('decodeBlendReserveHistoryState', () => {
  it('extracts reserve state for the target asset from decoded Hubble key/value JSON', () => {
    const state = decodeBlendReserveHistoryState(
      {
        bucketStart: new Date('2026-08-29T14:00:00.000Z'),
        bucketEnd: new Date('2026-08-29T15:00:00.000Z'),
        ledgerSequence: 42,
        events: [],
        ledgerEntries: [
          ledgerEntry({
            keyDecoded: { tag: 'ResData', asset: ASSET },
            valDecoded: {
              supplyApr: 0.04,
              borrowApr: 0.09,
              supplyAssets: 1_000,
              borrowAssets: 250,
            },
          }),
        ],
      },
      ASSET
    )

    expect(state).toEqual({
      supplyApr: 0.04,
      borrowApr: 0.09,
      supplyAssets: 1000,
      borrowAssets: 250,
      utilizationRate: 0.25,
    })
  })

  it('returns null when decoded state has no rates for that reserve', () => {
    const state = decodeBlendReserveHistoryState(
      {
        bucketStart: new Date('2026-08-29T14:00:00.000Z'),
        bucketEnd: new Date('2026-08-29T15:00:00.000Z'),
        ledgerSequence: 42,
        events: [],
        ledgerEntries: [
          ledgerEntry({
            keyDecoded: { tag: 'ResData', asset: ASSET },
            valDecoded: {},
          }),
        ],
      },
      ASSET
    )

    expect(state).toBeNull()
  })
})
