/**
 * Reconstruct a Soroban contract's market history from Stellar Hubble and
 * write it as CSV.
 *
 * Goes through the registered adapter exactly as the backfill and the
 * reconcile job do — `getProducts` to enumerate the contract's markets,
 * `getApyHistory` to rebuild them — so what this prints is what those jobs
 * would store. Nothing is written to the database.
 *
 * Usage:
 *   pnpm stellar:history -- --protocol blend_v2.1 --contract C… --days 30 --dry-run
 *   pnpm stellar:history -- --protocol blend_v2.1 --contract C… --days 30
 *   pnpm stellar:history -- --protocol blend_v2.1 --contract C… \
 *     --from 2025-01-01 --to 2025-02-01 --interval HOUR --out path.csv
 *
 * --dry-run prices the Hubble queries (bytes processed) without running them.
 * Default output: docs/data/stellar-history/<protocol>-<contract>-<interval>-<from>_<to>.csv
 *
 * Env: GCP_PROJECT + GCP_SERVICE_ACCOUNT_BASE64 (BigQuery). STELLAR_RPC is
 * optional (Soroban RPC used by `getProducts`; defaults to a public endpoint).
 * HUBBLE_MAX_BYTES_BILLED caps the spend (default 20 GB).
 */
import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'

import type { ProtocolName } from '@/config/protocols-meta'
import { YIELD_ADAPTERS } from '@/config/protocols-server'
import type { BorrowMarketState } from '@/lib/db/types'
import { toHistoryResult } from '@/lib/protocols/core/history-result'
import type { HistoryTarget } from '@/lib/protocols/core/types'

function arg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const protocol = arg(args, '--protocol') as ProtocolName | undefined
  const contract = arg(args, '--contract')?.toUpperCase()
  const interval = (arg(args, '--interval') ?? 'HOUR').toUpperCase()
  const dryRun = args.includes('--dry-run')

  if (!protocol || !(protocol in YIELD_ADAPTERS) || !contract) {
    console.error(
      'Usage: --protocol <adapter id, e.g. blend_v2.1> --contract <C…> [--days N | --from YYYY-MM-DD --to YYYY-MM-DD] [--interval HOUR|DAY] [--dry-run] [--out file.csv]'
    )
    process.exit(1)
  }
  if (interval !== 'HOUR' && interval !== 'DAY') {
    console.error('--interval must be HOUR or DAY')
    process.exit(1)
  }

  const to = arg(args, '--to')
    ? new Date(`${arg(args, '--to')}T00:00:00Z`)
    : new Date()
  const from = arg(args, '--from')
    ? new Date(`${arg(args, '--from')}T00:00:00Z`)
    : new Date(to.getTime() - Number(arg(args, '--days') ?? 30) * 86400_000)

  const adapter = await YIELD_ADAPTERS[protocol]()
  if (!adapter.getApyHistory) {
    console.error(`${protocol} has no getApyHistory`)
    process.exit(1)
  }

  console.log(`\n📜 ${adapter.name} history for ${contract}`)
  console.log(
    `  Window:   ${from.toISOString()} → ${to.toISOString()} (${interval})`
  )

  // The contract's markets, as the catalogue sync would list them.
  const products = (await adapter.getProducts({ poolIds: [contract] })).filter(
    (p) => p.protocol.address.toUpperCase() === contract
  )
  if (products.length === 0) {
    console.error(`  No ${protocol} products found for ${contract}`)
    process.exit(1)
  }
  const symbols = new Map(products.map((p) => [p._id, p.asset.symbol]))
  const targets: HistoryTarget[] = products.map((p) => ({
    productId: p._id,
    chainId: p.protocol.chain.id,
    kind: p.kind,
    meta: p.protocol.meta as Record<string, unknown>,
  }))
  console.log(
    `  Products: ${targets.length} (${[...new Set(symbols.values())].join(', ')})`
  )

  if (dryRun) process.env.HUBBLE_DRY_RUN = '1'
  const log: string[] = []
  const { points, failures } = toHistoryResult(
    await adapter.getApyHistory({
      startTimestamp: Math.floor(from.getTime() / 1000),
      endTimestamp: Math.floor(to.getTime() / 1000),
      interval,
      targets,
      onProgress: (msg) => {
        log.push(msg)
        console.log(`  ${msg}`)
      },
    })
  )

  for (const f of failures) console.log(`  ⚠️  ${f.productId} — ${f.reason}`)
  if (dryRun) {
    console.log('\nDry run — nothing queried. Re-run without --dry-run.\n')
    process.exit(0)
  }

  const header = [
    'hour',
    'product_id',
    'kind',
    'asset',
    'apy_base',
    'apy_fees',
    'apy_net',
    'supply_assets',
    'borrow_assets',
    'utilization',
  ]
  const lines = [...points]
    .sort(
      (a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime() ||
        a.productId.localeCompare(b.productId)
    )
    .map((p) =>
      [
        p.timestamp.toISOString(),
        p.productId,
        p.kind,
        symbols.get(p.productId),
        p.apy.base,
        p.apy.fees,
        p.apy.net,
        p.market.supplyAssets,
        p.kind === 'borrow'
          ? (p.market as BorrowMarketState).borrowAssets
          : null,
        p.market.utilizationRate,
      ]
        .map(csvCell)
        .join(',')
    )

  const out =
    arg(args, '--out') ??
    `docs/data/stellar-history/${protocol}-${contract}-${interval.toLowerCase()}-${day(from)}_${day(to)}.csv`
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, [header.join(','), ...lines].join('\n') + '\n')

  const hours = new Set(points.map((p) => p.timestamp.getTime())).size
  console.log(
    `\n✅ ${points.length} points (${hours} buckets × ${targets.length} products) → ${out}\n`
  )
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Stellar history failed:', err)
  process.exit(1)
})
