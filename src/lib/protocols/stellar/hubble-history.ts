import type { BigQuery } from '@google-cloud/bigquery'
import { Address, xdr } from '@stellar/stellar-sdk'
import { createHash } from 'crypto'

import type {
  HistoryDataPoint,
  HistoryFailure,
  HistoryParams,
  HistoryResult,
  HistoryTarget,
} from '@/lib/protocols/core/types'

/**
 * Historical state reconstruction for Soroban contracts, from Stellar Hubble —
 * the public BigQuery mirror of the ledger (`crypto-stellar.crypto_stellar`).
 *
 * Stellar lending protocols publish no history API, so a past market state is
 * rebuilt from the ledger itself: every write to a contract's storage is a row
 * in `contract_data`. This module replays those rows into one storage snapshot
 * per time bucket and hands each snapshot to a protocol DECODER, which turns
 * storage into rates and amounts. Everything protocol-shaped — which contract,
 * which storage keys, what they mean — lives in the decoder; nothing here
 * knows about any protocol.
 *
 * Row format, from the stellar-etl transform that feeds Hubble:
 *   - `contract_data_xdr` = base64 `ContractDataEntry` (key + value ScVals)
 *   - `ledger_key_hash`   = hex sha256 of the entry's `LedgerKey` XDR
 * which is what lets a decoder name its keys exactly (`ledgerKeyHash`) and the
 * query fetch those keys and nothing else.
 */

const TABLES = {
  contractData: '`crypto-stellar.crypto_stellar.contract_data`',
  events: '`crypto-stellar.crypto_stellar.history_contract_events`',
} as const

/**
 * Hard ceiling on what one reconstruction may bill. The window query is cheap
 * (partition pruning on `closed_at`), but the seed — the last value of each key
 * BEFORE the window — scans back to the decoder's `stateSince`, and
 * `contract_data` is clustered on `last_modified_ledger` first, so the
 * `contract_id` filter prunes little. Over the limit BigQuery refuses the job,
 * and every target of the call becomes a `HistoryFailure`: the caller falls
 * back (the reconcile job heals from donors) instead of paying for an
 * unbounded scan.
 *
 * `HUBBLE_MAX_BYTES_BILLED` overrides it. `HUBBLE_DRY_RUN=1` prices a call
 * without running it — `pnpm stellar:history -- --dry-run` does exactly that.
 */
const DEFAULT_MAX_BYTES_BILLED = 20 * 1024 ** 3

/** One `contract_data` row as the query returns it. */
export interface HubbleContractDataRow {
  contract_id: string
  ledger_key_hash: string
  ledger_sequence: number
  closed_at: string
  contract_data_xdr: string | null
  deleted: boolean
}

/** One successful contract event, for decoders that ask for them. */
export interface HubbleContractEventRow {
  contract_id: string
  ledger_sequence: number
  closed_at: string
  topics_decoded: unknown
  data_decoded: unknown
}

/** A storage entry's value at some point in time. */
export interface StellarStateEntry {
  key: xdr.ScVal
  val: xdr.ScVal
  ledgerSequence: number
}

export interface StellarHistoryBucket {
  start: Date
  /** Exclusive. Never past the requested end: incomplete buckets are not emitted. */
  end: Date
  /** The contract's storage as of `end`, by `ledger_key_hash`. */
  state: ReadonlyMap<string, StellarStateEntry>
  /** Events closed inside [start, end). Empty unless the decoder asks for them. */
  events: HubbleContractEventRow[]
}

/**
 * The protocol-specific half of a Stellar history adapter. Implement it, and
 * `getApyHistory` is one call to `fetchStellarHubbleHistory`.
 */
export interface StellarHistoryDecoder {
  /** The Soroban contract that holds this product's state, or null if unknown. */
  contractId(target: HistoryTarget): string | null
  /** The storage keys `decode` reads for this contract. Only these are fetched. */
  ledgerKeys(contractId: string, targets: HistoryTarget[]): xdr.LedgerKey[]
  /** Storage snapshot → history points for one product (one, or none). */
  decode(ctx: {
    contractId: string
    target: HistoryTarget
    bucket: StellarHistoryBucket
  }): HistoryDataPoint[]
  /** No relevant write predates this — bounds the seed scan. */
  stateSince?: Date
  /** Also fetch the contract's events. Off by default: it is a second scan. */
  events?: boolean
}

export function ledgerKeyHash(key: xdr.LedgerKey): string {
  return createHash('sha256').update(key.toXDR()).digest('hex')
}

/** The instance entry of a contract — where Soroban keeps its config-style storage. */
export function contractInstanceKey(contractId: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  )
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}

// ─── Buckets ──────────────────────────────────────────────────────────────────

function intervalMs(interval: HistoryParams['interval']): number {
  return interval === 'DAY' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000
}

export function bucketStart(
  at: Date,
  interval: HistoryParams['interval']
): Date {
  const d = new Date(at)
  d.setUTCMinutes(0, 0, 0)
  if (interval === 'DAY') d.setUTCHours(0)
  return d
}

/**
 * Every COMPLETE bucket overlapping [start, end): the first one may begin
 * before `start` (its end-state is still a fact), the last one must have
 * closed by `end` — a bucket still in progress would be projected into the
 * future by the decoder, and a backfill would store that guess as history.
 */
export function bucketStarts({
  start,
  end,
  interval,
}: {
  start: Date
  end: Date
  interval: HistoryParams['interval']
}): Date[] {
  const step = intervalMs(interval)
  const out: Date[] = []
  for (
    let t = bucketStart(start, interval).getTime();
    t + step <= end.getTime();
    t += step
  ) {
    out.push(new Date(t))
  }
  return out
}

function decodeRow(row: HubbleContractDataRow): StellarStateEntry | null {
  if (!row.contract_data_xdr) return null
  const entry = xdr.ContractDataEntry.fromXDR(row.contract_data_xdr, 'base64')
  return {
    key: entry.key(),
    val: entry.val(),
    ledgerSequence: row.ledger_sequence,
  }
}

/**
 * Replays `contract_data` rows into one storage snapshot per bucket.
 *
 * Hubble records CHANGES, not a copy of every key on every ledger, so each key
 * carries its last value forward into buckets where nothing wrote it; a
 * deleted key drops out until written again. Rows must include the seed — the
 * last value of each key before the window — or early buckets start empty.
 *
 * Two writes of one key inside one ledger are ordered by `ledger_sequence`
 * only, i.e. arbitrarily: a few seconds of difference inside an hour bucket.
 */
export function reconstructBuckets({
  rows,
  events = [],
  start,
  end,
  interval,
}: {
  rows: HubbleContractDataRow[]
  events?: HubbleContractEventRow[]
  start: Date
  end: Date
  interval: HistoryParams['interval']
}): StellarHistoryBucket[] {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime() ||
      a.ledger_sequence - b.ledger_sequence
  )
  const eventsByBucket = groupBy(events, (ev) =>
    String(bucketStart(new Date(ev.closed_at), interval).getTime())
  )

  const state = new Map<string, StellarStateEntry>()
  let idx = 0
  return bucketStarts({ start, end, interval }).map((bucketStartAt) => {
    const bucketEnd = new Date(bucketStartAt.getTime() + intervalMs(interval))
    while (
      idx < sorted.length &&
      new Date(sorted[idx].closed_at).getTime() < bucketEnd.getTime()
    ) {
      const row = sorted[idx++]
      const entry = row.deleted ? null : decodeRow(row)
      if (entry) state.set(row.ledger_key_hash, entry)
      else state.delete(row.ledger_key_hash)
    }
    return {
      start: bucketStartAt,
      end: bucketEnd,
      state: new Map(state),
      events: eventsByBucket.get(String(bucketStartAt.getTime())) ?? [],
    }
  })
}

// ─── Queries ──────────────────────────────────────────────────────────────────

interface QueryContext {
  client: BigQuery
  dryRun: boolean
  maxBytesBilled: number
  log: (msg: string) => void
}

async function runQuery<T>(
  ctx: QueryContext,
  label: string,
  query: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const [job] = await ctx.client.createQueryJob({
    query,
    params,
    location: 'US',
    dryRun: ctx.dryRun,
    maximumBytesBilled: String(ctx.maxBytesBilled),
  })
  const stats = job.metadata?.statistics
  if (ctx.dryRun) {
    const bytes = Number(stats?.totalBytesProcessed ?? 0)
    ctx.log(`[history:stellar] ${label}: dry run, would process ${gb(bytes)}`)
    return []
  }
  const [rows] = (await job.getQueryResults()) as [T[]]
  const [meta] = await job.getMetadata()
  const billed = Number(meta?.statistics?.query?.totalBytesBilled ?? 0)
  ctx.log(
    `[history:stellar] ${label}: ${rows.length} rows, billed ${gb(billed)}`
  )
  return rows
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function queryContractData(
  ctx: QueryContext,
  p: {
    contractIds: string[]
    keyHashes: string[]
    since: Date
    start: Date
    end: Date
  }
): Promise<HubbleContractDataRow[]> {
  const columns = `
    contract_id,
    ledger_key_hash,
    ledger_sequence,
    FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', closed_at) AS closed_at,
    contract_data_xdr,
    deleted`
  const where = `
    contract_id IN UNNEST(@contract_ids)
    AND ledger_key_hash IN UNNEST(@key_hashes)`
  // seed: each key's last state before the window; window: every change in it.
  const query = `
    WITH seed AS (
      SELECT ${columns}
      FROM ${TABLES.contractData}
      WHERE ${where}
        AND closed_at >= TIMESTAMP(@since)
        AND closed_at < TIMESTAMP(@start_at)
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY contract_id, ledger_key_hash
        ORDER BY closed_at DESC, ledger_sequence DESC
      ) = 1
    )
    SELECT * FROM seed WHERE NOT deleted
    UNION ALL
    SELECT ${columns}
    FROM ${TABLES.contractData}
    WHERE ${where}
      AND closed_at >= TIMESTAMP(@start_at)
      AND closed_at < TIMESTAMP(@end_at)`
  return runQuery<HubbleContractDataRow>(ctx, 'contract_data', query, {
    contract_ids: p.contractIds,
    key_hashes: p.keyHashes,
    since: p.since.toISOString(),
    start_at: p.start.toISOString(),
    end_at: p.end.toISOString(),
  })
}

function queryContractEvents(
  ctx: QueryContext,
  p: { contractIds: string[]; start: Date; end: Date }
): Promise<HubbleContractEventRow[]> {
  const query = `
    SELECT
      contract_id,
      ledger_sequence,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', closed_at) AS closed_at,
      topics_decoded,
      data_decoded
    FROM ${TABLES.events}
    WHERE contract_id IN UNNEST(@contract_ids)
      AND closed_at >= TIMESTAMP(@start_at)
      AND closed_at < TIMESTAMP(@end_at)
      AND type_string = 'ContractEventTypeContract'
      AND successful AND in_successful_contract_call`
  return runQuery<HubbleContractEventRow>(ctx, 'contract_events', query, {
    contract_ids: p.contractIds,
    start_at: p.start.toISOString(),
    end_at: p.end.toISOString(),
  })
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Rebuild `targets`' history over [startTimestamp, endTimestamp) from Hubble,
 * one point per complete bucket, through `decoder`.
 *
 * Failure semantics: a target with NO point is a `HistoryFailure` (bad meta,
 * nothing on-chain, the query refused or over budget). A target with SOME
 * points is a success — a pool created mid-window simply starts later.
 */
export async function fetchStellarHubbleHistory({
  client,
  targets,
  startTimestamp,
  endTimestamp,
  interval,
  decoder,
  onProgress,
}: {
  client: BigQuery
  targets: HistoryTarget[]
  startTimestamp: number
  endTimestamp: number
  interval: HistoryParams['interval']
  decoder: StellarHistoryDecoder
  onProgress?: (msg: string) => void
}): Promise<HistoryResult> {
  const log = onProgress ?? console.log
  const failures: HistoryFailure[] = []

  const located: { target: HistoryTarget; contractId: string }[] = []
  for (const target of targets) {
    const contractId = decoder.contractId(target)
    if (contractId) located.push({ target, contractId })
    else
      failures.push({
        productId: target.productId,
        reason: 'no Soroban contract id in target meta',
      })
  }
  if (located.length === 0) return { points: [], failures }

  const byContract = groupBy(located, (l) => l.contractId)
  const contractIds = [...byContract.keys()]
  const keyHashes = [
    ...new Set(
      contractIds.flatMap((id) =>
        decoder
          .ledgerKeys(
            id,
            byContract.get(id)!.map((l) => l.target)
          )
          .map(ledgerKeyHash)
      )
    ),
  ]

  const start = new Date(startTimestamp * 1000)
  const end = new Date(endTimestamp * 1000)
  const ctx: QueryContext = {
    client,
    dryRun: process.env.HUBBLE_DRY_RUN === '1',
    maxBytesBilled:
      Number(process.env.HUBBLE_MAX_BYTES_BILLED) || DEFAULT_MAX_BYTES_BILLED,
    log,
  }
  log(
    `[history:stellar] ${contractIds.length} contracts, ${keyHashes.length} storage keys, ${interval}, ${start.toISOString()} → ${end.toISOString()}`
  )

  let rows: HubbleContractDataRow[]
  let events: HubbleContractEventRow[]
  try {
    ;[rows, events] = await Promise.all([
      queryContractData(ctx, {
        contractIds,
        keyHashes,
        since: decoder.stateSince ?? new Date(0),
        start,
        end,
      }),
      decoder.events
        ? queryContractEvents(ctx, { contractIds, start, end })
        : Promise.resolve([]),
    ])
  } catch (err) {
    const reason = `Hubble query failed: ${err instanceof Error ? err.message : String(err)}`
    log(`[history:stellar] ${reason}`)
    return {
      points: [],
      failures: [
        ...failures,
        ...located.map((l) => ({ productId: l.target.productId, reason })),
      ],
    }
  }
  if (ctx.dryRun) return { points: [], failures }

  const rowsByContract = groupBy(rows, (r) => r.contract_id)
  const eventsByContract = groupBy(events, (e) => e.contract_id)
  const points: HistoryDataPoint[] = []

  for (const [contractId, entries] of byContract) {
    const buckets = reconstructBuckets({
      rows: rowsByContract.get(contractId) ?? [],
      events: eventsByContract.get(contractId) ?? [],
      start,
      end,
      interval,
    })
    for (const { target } of entries) {
      // One product's storage the decoder cannot read (an unknown layout, a
      // contract upgrade) fails that product, not the whole call.
      let own: HistoryDataPoint[]
      try {
        own = buckets.flatMap((bucket) =>
          decoder.decode({ contractId, target, bucket })
        )
      } catch (err) {
        failures.push({
          productId: target.productId,
          reason: `decode failed: ${err instanceof Error ? err.message : String(err)}`,
        })
        continue
      }
      if (own.length === 0) {
        failures.push({
          productId: target.productId,
          reason: 'no state in Hubble for this product over the window',
        })
      }
      points.push(...own)
    }
  }

  return { points, failures }
}
