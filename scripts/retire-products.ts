/**
 * Retire a protocol version from collection: mark its products inactive and
 * close their open availability periods, so gap detection, the heal job and
 * /status stop expecting them. Rows and history stay in the database.
 *
 * WHEN TO RUN THIS: after unregistering the version's adapter (protocols-meta,
 * protocols-server, protocols-presentation). The hourly products sync cannot
 * do it: availability is reconciled per provider, and a provider whose
 * enumeration suddenly shrinks by more than half is refused as a probable
 * outage ("enumeration collapsed") — a retirement looks exactly like one. This
 * is the human saying otherwise. Until it runs, that sync keeps refusing the
 * provider, so the remaining versions' new products get no period either.
 *
 * Refuses a version that is still registered: the next sync would reopen it.
 * Each period closes at the hour after the last full hour collected for it
 * (`closeAvailability`), never later than now.
 *
 * DRY-RUN BY DEFAULT. Pass --write to persist.
 *
 * Usage:
 *   pnpm retire:products -- --provider blend --versions v1,v2
 *   pnpm retire:products -- --provider blend --versions v1,v2 --write
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'

import { PROTOCOLS_META } from '@/config/protocols-meta'
import { db } from '@/lib/db/postgres'
import { closeAvailability } from '@/lib/db/repositories/products'
import { productAvailabilityPeriods, products } from '@/lib/db/schema'

function arg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const provider = arg(args, '--provider')
  const versions = (arg(args, '--versions') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const write = args.includes('--write')

  if (!provider || versions.length === 0) {
    console.error('Usage: --provider <name> --versions <v1,v2> [--write]')
    process.exit(1)
  }

  const stillRegistered = versions.filter(
    (v) => `${provider}_${v}` in PROTOCOLS_META
  )
  if (stillRegistered.length > 0) {
    console.error(
      `❌ ${stillRegistered.map((v) => `${provider}_${v}`).join(', ')} still registered in PROTOCOLS_META — unregister first, or the next sync reopens it.`
    )
    process.exit(1)
  }

  const rows = await db
    .select({
      id: products.id,
      version: products.version,
      active: products.active,
      openSince: productAvailabilityPeriods.activatedAt,
    })
    .from(products)
    .leftJoin(
      productAvailabilityPeriods,
      and(
        eq(productAvailabilityPeriods.productId, products.id),
        isNull(productAvailabilityPeriods.deactivatedAt)
      )
    )
    .where(
      and(eq(products.provider, provider), inArray(products.version, versions))
    )

  const toRetire = [
    ...new Set(rows.filter((r) => r.active || r.openSince).map((r) => r.id)),
  ]

  console.log(
    `\n🧊 Retire ${provider} ${versions.join(', ')} ${write ? '(WRITE)' : '(dry run)'}`
  )
  for (const v of versions) {
    const own = rows.filter((r) => r.version === v)
    console.log(
      `  ${v}: ${new Set(own.map((r) => r.id)).size} products, ` +
        `${own.filter((r) => r.active).length} active, ` +
        `${own.filter((r) => r.openSince).length} open periods`
    )
  }
  console.log(`  To retire: ${toRetire.length} products`)

  if (!write) {
    console.log('\nDry run — nothing written. Re-run with --write.\n')
    process.exit(0)
  }

  await closeAvailability(toRetire, new Date())
  console.log(`\n✅ Retired ${toRetire.length} products.\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Retirement failed:', err)
  process.exit(1)
})
