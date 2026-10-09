import { Version } from '@blend-capital/blend-sdk'
import { xdr } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import type { BorrowMarketState } from '@/lib/db/types'
import type { HistoryTarget } from '@/lib/protocols/core/types'
import {
  type StellarHistoryBucket,
  type StellarStateEntry,
  ledgerKeyHash,
} from '@/lib/protocols/stellar/hubble-history'
import { aprToApyDaily } from '@/lib/utils'

import { blendHistoryDecoder } from '../apy-history'
import fixedV1 from './fixtures/fixed-v1-reserve.json'
import fixedV2_1 from './fixtures/fixed-v2-1-reserve.json'
import fixedV2 from './fixtures/fixed-v2-reserve.json'

/**
 * Fixtures are real mainnet storage (Soroban RPC `getLedgerEntries`) for a
 * reserve of each Fixed pool — v1 and v2 On Ice, v2.1 Active (its USDC
 * reserve, 26 % utilized) — encoded exactly as Hubble stores `contract_data`
 * rows. v2.1 runs the v2 contract, so it decodes with `Version.V2`. `expected` is what the Blend SDK's own
 * `Reserve.load` computed from the chain at `timestamp`. The decoder, given the
 * same storage and the same instant, must agree with the SDK.
 */
type Fixture = typeof fixedV2

function bucketAt(fixture: Fixture, end: number): StellarHistoryBucket {
  const state = new Map<string, StellarStateEntry>()
  for (const row of fixture.rows) {
    const entry = xdr.ContractDataEntry.fromXDR(row.contract_data_xdr, 'base64')
    state.set(row.ledger_key_hash, {
      key: entry.key(),
      val: entry.val(),
      ledgerSequence: row.ledger_sequence,
    })
  }
  return {
    start: new Date((end - 3600) * 1000),
    end: new Date(end * 1000),
    state,
    events: [],
  }
}

function target(fixture: Fixture, kind: 'supply' | 'borrow'): HistoryTarget {
  return {
    productId: `test:${fixture.poolId}:${fixture.assetId}:${kind}`,
    chainId: -1,
    kind,
    meta: {
      version: fixture.version,
      poolId: fixture.poolId,
      assetId: fixture.assetId,
    },
  }
}

describe.each([
  ['v1', fixedV1 as Fixture, Version.V1],
  ['v2', fixedV2 as Fixture, Version.V2],
  ['v2.1', fixedV2_1 as Fixture, Version.V2],
])('blendHistoryDecoder %s (real mainnet storage)', (_, fixture, version) => {
  const decoder = blendHistoryDecoder(version)
  const bucket = bucketAt(fixture, fixture.timestamp)

  it('names the pool instance and the reserve config/data keys Hubble stores', () => {
    const hashes = decoder
      .ledgerKeys(fixture.poolId, [target(fixture, 'supply')])
      .map(ledgerKeyHash)

    expect(new Set(hashes)).toEqual(
      new Set(fixture.rows.map((r) => r.ledger_key_hash))
    )
  })

  it('reproduces the SDK supply rate, amounts and utilization', () => {
    const [point] = decoder.decode({
      contractId: fixture.poolId,
      target: target(fixture, 'supply'),
      bucket,
    })
    const { expected } = fixture

    expect(point.kind).toBe('supply')
    expect(point.timestamp).toEqual(bucket.start)
    expect(point.apy.net).toBeCloseTo(aprToApyDaily(expected.supplyApr), 12)
    expect(point.apy.base).toBeCloseTo(
      aprToApyDaily(expected.borrowApr * expected.utilizationRate),
      12
    )
    expect(point.apy.rewards).toBe(0)
    expect(point.market.supplyAssets).toBeCloseTo(expected.supplyAssets, 6)
    expect(point.market.utilizationRate).toBeCloseTo(
      expected.utilizationRate,
      12
    )
    expect(point.market.supplyAssetsUsd).toBeNull()
  })

  it('reproduces the SDK borrow rate and liabilities', () => {
    const [point] = decoder.decode({
      contractId: fixture.poolId,
      target: target(fixture, 'borrow'),
      bucket,
    })
    const { expected } = fixture

    expect(point.kind).toBe('borrow')
    expect(point.apy.net).toBeCloseTo(aprToApyDaily(expected.borrowApr), 12)
    expect((point.market as BorrowMarketState).borrowAssets).toBeCloseTo(
      expected.borrowAssets,
      6
    )
  })

  it('emits nothing for a bucket before the reserve existed', () => {
    const empty = { ...bucket, state: new Map() }
    expect(
      decoder.decode({
        contractId: fixture.poolId,
        target: target(fixture, 'supply'),
        bucket: empty,
      })
    ).toEqual([])
  })

  it('does not drift when the same storage is decoded twice', () => {
    const args = {
      contractId: fixture.poolId,
      target: target(fixture, 'supply'),
      bucket,
    }
    expect(decoder.decode(args)).toEqual(decoder.decode(args))
  })
})

describe('blendHistoryDecoder targets', () => {
  it('locates the pool from the poolId getProducts wrote into meta', () => {
    const decoder = blendHistoryDecoder(Version.V2)
    expect(decoder.contractId(target(fixedV2 as Fixture, 'supply'))).toBe(
      fixedV2.poolId
    )
    expect(
      decoder.contractId({ ...target(fixedV2 as Fixture, 'supply'), meta: {} })
    ).toBeNull()
  })
})
