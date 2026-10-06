import type { BigQuery } from '@google-cloud/bigquery'

import type { BorrowMarketState, SupplyMarketState } from '@/lib/db/types'
import type {
  HistoryDataPoint,
  HistoryFailure,
  HistoryParams,
  HistoryResult,
  HistoryTarget,
} from '@/lib/protocols/core/types'

export interface HubbleLedgerEntryRow {
  contract_id: string
  ledger_sequence: number
  closed_at: string
  ledger_key_hash: string
  ledger_key_hash_base_64: string | null
  key: unknown
  val: unknown
  key_decoded: unknown
  val_decoded: unknown
  contract_data_xdr: string | null
  deleted: boolean
}

export interface HubbleContractEventRow {
  contract_id: string
  ledger_sequence: number
  closed_at: string
  topic_decoded: unknown
  data_decoded: unknown
}

export interface HubbleHistoryBucket {
  bucketStart: Date
  bucketEnd: Date
  ledgerSequence: number
  /** Latest ledger entry per contract-data key as of bucketEnd. */
  ledgerEntries: HubbleLedgerEntryRow[]
  /** Successful contract events whose closed_at falls inside this bucket. */
  events: HubbleContractEventRow[]
}

export interface StellarHistoryDecodeContext {
  contractId: string
  target: HistoryTarget
  interval: HistoryParams['interval']
  bucket: HubbleHistoryBucket
}

export type StellarHistoryDecodeHook = (
  ctx: StellarHistoryDecodeContext
) => HistoryDataPoint[]

export interface FetchStellarHistoryParams {
  client: BigQuery
  targets: HistoryTarget[]
  startTimestamp: number
  endTimestamp: number
  interval: HistoryParams['interval']
  decode: StellarHistoryDecodeHook
  onProgress?: (msg: string) => void
}

type ContractRow = HubbleLedgerEntryRow | HubbleContractEventRow

const HUBBLE_TABLES = {
  events: '`crypto-stellar.crypto_stellar.history_contract_events`',
  ledgerEntries: '`crypto-stellar.crypto_stellar.contract_data`',
} as const

export function unknownSupplyMarket(): SupplyMarketState {
  return {
    supplyAssets: null,
    supplyAssetsUsd: null,
    utilizationRate: null,
    assetPriceUsd: null,
  }
}

export function unknownBorrowMarket(): BorrowMarketState {
  return {
    supplyAssets: null,
    supplyAssetsUsd: null,
    borrowAssets: null,
    borrowAssetsUsd: null,
    utilizationRate: null,
    assetPriceUsd: null,
    collateralAssetsUsd: null,
    priceCollateralInLoanAsset: null,
  }
}

export function historyFailure(
  target: HistoryTarget,
  reason: string
): HistoryFailure {
  return { productId: target.productId, reason }
}

export function contractIdFromTarget(target: HistoryTarget): string | null {
  const poolId = target.meta.poolId ?? target.meta.protocolAddress
  if (typeof poolId === 'string' && poolId.length > 0) {
    return poolId.toUpperCase()
  }
  return null
}

function intervalMs(interval: HistoryParams['interval']): number {
  return interval === 'DAY' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000
}

export function bucketStart(
  closedAt: Date,
  interval: HistoryParams['interval']
): Date {
  const d = new Date(closedAt)
  d.setUTCMinutes(0, 0, 0)
  if (interval === 'DAY') d.setUTCHours(0, 0, 0, 0)
  return d
}

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
  const cursor = bucketStart(start, interval)
  const out: Date[] = []
  while (cursor < end) {
    out.push(new Date(cursor))
    cursor.setTime(cursor.getTime() + step)
  }
  return out
}

export function latestRowPerBucket<T extends ContractRow>(
  rows: T[],
  interval: HistoryParams['interval']
): Map<string, T> {
  const out = new Map<string, T>()
  for (const row of rows) {
    const key = bucketStart(new Date(row.closed_at), interval).toISOString()
    const existing = out.get(key)
    if (!existing || row.ledger_sequence > existing.ledger_sequence) {
      out.set(key, row)
    }
  }
  return out
}

function groupEvents(
  rows: HubbleContractEventRow[],
  interval: HistoryParams['interval']
): Map<string, HubbleContractEventRow[]> {
  const out = new Map<string, HubbleContractEventRow[]>()
  for (const row of rows) {
    const key = bucketStart(new Date(row.closed_at), interval).toISOString()
    const list = out.get(key) ?? []
    list.push(row)
    out.set(key, list)
  }
  return out
}

function ledgerEntryKey(row: HubbleLedgerEntryRow): string {
  return row.ledger_key_hash
}

/**
 * Builds one point-in-time contract-data snapshot per requested bucket.
 *
 * Hubble ledger-entry history records changes, not a full copy of every key on
 * every ledger. So a correct historical state series must carry forward the
 * latest value for every contract-data key into buckets where no write occurred.
 */
export function reconstructHubbleBuckets({
  ledgerRows,
  eventRows,
  start,
  end,
  interval,
}: {
  ledgerRows: HubbleLedgerEntryRow[]
  eventRows: HubbleContractEventRow[]
  start: Date
  end: Date
  interval: HistoryParams['interval']
}): HubbleHistoryBucket[] {
  const sortedLedger = [...ledgerRows].sort(
    (a, b) =>
      new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime() ||
      a.ledger_sequence - b.ledger_sequence
  )
  const events = groupEvents(eventRows, interval)
  const current = new Map<string, HubbleLedgerEntryRow>()
  let idx = 0

  return bucketStarts({ start, end, interval }).map((startAt) => {
    const endAt = new Date(startAt.getTime() + intervalMs(interval))
    while (
      idx < sortedLedger.length &&
      new Date(sortedLedger[idx].closed_at).getTime() < endAt.getTime()
    ) {
      const row = sortedLedger[idx]
      const key = ledgerEntryKey(row)
      if (row.deleted) current.delete(key)
      else current.set(key, row)
      idx += 1
    }

    const ledgerEntries = [...current.values()]
    const ledgerSequence = ledgerEntries.reduce(
      (max, row) => Math.max(max, row.ledger_sequence),
      0
    )

    return {
      bucketStart: startAt,
      bucketEnd: endAt,
      ledgerSequence,
      ledgerEntries,
      events: events.get(startAt.toISOString()) ?? [],
    }
  })
}

async function queryLedgerEntries({
  client,
  contractIds,
  start,
  end,
}: {
  client: BigQuery
  contractIds: string[]
  start: Date
  end: Date
}): Promise<HubbleLedgerEntryRow[]> {
  const columns = `
    contract_id,
    ledger_sequence,
    CAST(closed_at AS STRING) AS closed_at,
    ledger_key_hash,
    ledger_key_hash_base_64,
    key,
    val,
    key_decoded,
    val_decoded,
    contract_data_xdr,
    deleted
  `
  const query = `
    WITH seed AS (
      SELECT * EXCEPT(rn)
      FROM (
        SELECT
          ${columns},
          ROW_NUMBER() OVER (
            PARTITION BY contract_id, ledger_key_hash
            ORDER BY closed_at DESC, ledger_sequence DESC
          ) AS rn
        FROM ${HUBBLE_TABLES.ledgerEntries}
        WHERE contract_id IN UNNEST(@contract_ids)
          AND closed_at < @start_at
      )
      WHERE rn = 1 AND NOT deleted
    ),
    changes AS (
      SELECT
        ${columns}
      FROM ${HUBBLE_TABLES.ledgerEntries}
      WHERE contract_id IN UNNEST(@contract_ids)
        AND closed_at >= @start_at
        AND closed_at < @end_at
    )
    SELECT * FROM seed
    UNION ALL
    SELECT * FROM changes
    ORDER BY contract_id, closed_at ASC, ledger_sequence ASC
  `
  const [job] = await client.createQueryJob({
    query,
    params: {
      contract_ids: contractIds,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
    },
    location: 'US',
  })
  const [rows] = (await job.getQueryResults()) as [HubbleLedgerEntryRow[]]
  return rows
}

async function queryContractEvents({
  client,
  contractIds,
  start,
  end,
}: {
  client: BigQuery
  contractIds: string[]
  start: Date
  end: Date
}): Promise<HubbleContractEventRow[]> {
  const query = `
    SELECT
      contract_id,
      ledger_sequence,
      CAST(closed_at AS STRING) AS closed_at,
      topics_decoded AS topic_decoded,
      data_decoded
    FROM ${HUBBLE_TABLES.events}
    WHERE contract_id IN UNNEST(@contract_ids)
      AND closed_at >= @start_at
      AND closed_at < @end_at
      AND successful
      AND in_successful_contract_call
    ORDER BY contract_id, closed_at ASC, ledger_sequence ASC
  `
  const [job] = await client.createQueryJob({
    query,
    params: {
      contract_ids: contractIds,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
    },
    location: 'US',
  })
  const [rows] = (await job.getQueryResults()) as [HubbleContractEventRow[]]
  return rows
}

export async function fetchStellarHubbleHistory({
  client,
  targets,
  startTimestamp,
  endTimestamp,
  interval,
  decode,
  onProgress,
}: FetchStellarHistoryParams): Promise<HistoryResult> {
  const log = onProgress ?? console.log
  const byContract = new Map<string, HistoryTarget[]>()
  const failures: HistoryFailure[] = []

  for (const target of targets) {
    const contractId = contractIdFromTarget(target)
    if (!contractId) {
      failures.push(
        historyFailure(
          target,
          'target meta does not contain a poolId or protocolAddress'
        )
      )
      continue
    }
    const list = byContract.get(contractId) ?? []
    list.push(target)
    byContract.set(contractId, list)
  }

  const contractIds = [...byContract.keys()]
  if (contractIds.length === 0) return { points: [], failures }

  const start = new Date(startTimestamp * 1000)
  const end = new Date(endTimestamp * 1000)
  log(
    `[history:stellar] Hubble fetch ${contractIds.length} contracts, ${interval}, ${start.toISOString()} -> ${end.toISOString()}`
  )

  const [ledgerRows, eventRows] = await Promise.all([
    queryLedgerEntries({ client, contractIds, start, end }),
    queryContractEvents({ client, contractIds, start, end }),
  ])

  const ledgerByContract = new Map<string, HubbleLedgerEntryRow[]>()
  for (const row of ledgerRows) {
    const list = ledgerByContract.get(row.contract_id) ?? []
    list.push(row)
    ledgerByContract.set(row.contract_id, list)
  }

  const eventsByContract = new Map<string, HubbleContractEventRow[]>()
  for (const row of eventRows) {
    const list = eventsByContract.get(row.contract_id) ?? []
    list.push(row)
    eventsByContract.set(row.contract_id, list)
  }

  const points: HistoryDataPoint[] = []
  for (const [contractId, contractTargets] of byContract) {
    const buckets = reconstructHubbleBuckets({
      ledgerRows: ledgerByContract.get(contractId) ?? [],
      eventRows: eventsByContract.get(contractId) ?? [],
      start,
      end,
      interval,
    })

    if (buckets.every((bucket) => bucket.ledgerEntries.length === 0)) {
      for (const target of contractTargets) {
        failures.push(
          historyFailure(target, 'Hubble returned no state buckets')
        )
      }
      continue
    }

    for (const bucket of buckets) {
      for (const target of contractTargets) {
        points.push(...decode({ contractId, target, interval, bucket }))
      }
    }
  }

  return { points, failures }
}
