import {
  CHAIN_BY_ID,
  type ChainFamily,
} from '@/lib/protocols/core/toolkit/chain-slugs'
import type { YieldAdapter } from '@/lib/protocols/core/types'

import type { FamilyReport, ReconcileReport } from './types'

/**
 * The chain family of an adapter, from the chains it declares: '-1' is
 * Stellar, '-2' Solana, every eip155 id is EVM (chain-slugs.ts). Null when its chains span
 * several families or include one the registry does not know — reconcile then
 * records an error rather than guessing.
 */
export function adapterFamily(
  adapter: Pick<YieldAdapter, 'chains'>
): ChainFamily | null {
  const families = new Set<ChainFamily>()
  for (const id of Object.keys(adapter.chains)) {
    const chain = CHAIN_BY_ID[Number(id)]
    if (!chain) return null
    families.add(chain.family)
  }
  return families.size === 1 ? [...families][0] : null
}

export function emptyFamilyReport(): FamilyReport {
  return {
    adapters: [],
    gaps: 0,
    repaired: { byRefetch: 0, byNeighbor: 0, noDonor: 0 },
    fetch: { requested: 0, returned: 0, failed: 0 },
  }
}

/**
 * The family section of a stored reconcile report, as a small table — what
 * `scripts/reconcile-status.ts` prints as the monitoring status report.
 */
export function formatFamilies(row: {
  id: string
  createdAt: Date
  payload: unknown
}): string {
  const report = row.payload as Partial<ReconcileReport>
  const lines = [
    `reconcile report ${row.id} — ${row.createdAt.toISOString()}`,
    `window ${report.window ?? '?'} · success ${String(report.success)} · dryRun ${String(report.dryRun)}`,
  ]

  const families = report.families
  if (!families || Object.keys(families).length === 0) {
    lines.push('no family section — this report predates per-family monitoring')
    return lines.join('\n')
  }

  lines.push(
    [
      'family'.padEnd(8),
      'gaps'.padStart(6),
      'refetch'.padStart(9),
      'neighbour'.padStart(11),
      'no donor'.padStart(10),
      'history req/ret/fail'.padStart(22),
      '  adapters',
    ].join('')
  )
  for (const [family, f] of Object.entries(families)) {
    if (!f) continue
    const adapters = f.adapters
      .map((a) => (a.hasHistory ? `${a.id} (history)` : a.id))
      .join(', ')
    lines.push(
      [
        family.padEnd(8),
        String(f.gaps).padStart(6),
        String(f.repaired.byRefetch).padStart(9),
        String(f.repaired.byNeighbor).padStart(11),
        String(f.repaired.noDonor).padStart(10),
        `${f.fetch.requested}/${f.fetch.returned}/${f.fetch.failed}`.padStart(
          22
        ),
        `  ${adapters}`,
      ].join('')
    )
  }
  return lines.join('\n')
}
