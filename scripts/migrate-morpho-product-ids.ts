/**
 * @file scripts/migrate-morpho-product-ids.ts
 * One-shot data migration: rewrite legacy Morpho productIds to the unified scheme.
 *
 *   metamorpho:v1:{chain}:vault:{addr}  →  morpho:v1:{chain}:vault:{addr}:supply
 *   morphoblue:v1:{chain}:market:{id}   →  morpho:v1:{chain}:market:{id}:borrow
 *
 * Rewrites the productId key in products.id, apy_hourly.product_id and
 * apy_daily.product_id. Idempotent — once the legacy prefixes are gone a
 * re-run is a no-op. No FK constraints couple these tables, so the per-table
 * UPDATEs are run sequentially (neon-http has no interactive transactions).
 *
 * ⚠️  DEPLOY ORDERING — run IMMEDIATELY AFTER deploying the code that emits
 *     the new `morpho:` scheme. If run while the old code is still live, the
 *     next 10-min apy cron + daily products sync will re-create legacy ids.
 *
 * Usage:
 *   pnpm run migrate:morpho-ids -- --dry   # preview row counts, no writes
 *   pnpm run migrate:morpho-ids            # apply
 */
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const sql = neon(url)

// Fixed whitelist — table/column names are interpolated, so they must never
// come from external input.
const TARGETS = [
  { table: 'products', col: 'id' },
  { table: 'apy_hourly', col: 'product_id' },
  { table: 'apy_daily', col: 'product_id' },
] as const

const RULES = [
  { legacyPrefix: 'metamorpho:', kind: 'supply' },
  { legacyPrefix: 'morphoblue:', kind: 'borrow' },
] as const

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  console.log(`\n🔀 Morpho productId migration${dry ? ' (dry run)' : ''}\n`)

  for (const { table, col } of TARGETS) {
    for (const { legacyPrefix, kind } of RULES) {
      const likePattern = `${legacyPrefix}%`
      const anchoredRegex = `^${legacyPrefix}` // e.g. "^metamorpho:"

      const [{ n }] = (await sql.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE ${col} LIKE $1`,
        [likePattern]
      )) as { n: number }[]

      if (dry || n === 0) {
        console.log(
          `  ${dry ? '[dry] ' : ''}${table}.${col}  ${legacyPrefix}… → morpho:…:${kind}  rows=${n}`
        )
        continue
      }

      // regexp_replace replaces only the anchored leading prefix; the trailing
      // kind segment is appended to match buildVaultProductId/buildMarketProductId.
      await sql.query(
        `UPDATE ${table}
           SET ${col} = regexp_replace(${col}, $1, 'morpho:') || $2
         WHERE ${col} LIKE $3`,
        [anchoredRegex, `:${kind}`, likePattern]
      )
      console.log(
        `  ${table}.${col}  ${legacyPrefix}… → morpho:…:${kind}  updated=${n}`
      )
    }
  }

  // ─── Verify no legacy ids remain ──────────────────────────────────────────
  if (!dry) {
    console.log('\n🔎 Verification:')
    let leftover = 0
    for (const { table, col } of TARGETS) {
      const [{ n }] = (await sql.query(
        `SELECT count(*)::int AS n FROM ${table}
         WHERE ${col} LIKE 'metamorpho:%' OR ${col} LIKE 'morphoblue:%'`,
        []
      )) as { n: number }[]
      leftover += n
      console.log(`  ${table}: ${n} legacy ids remaining`)
    }
    if (leftover > 0) {
      console.error('\n❌ Legacy ids still present — re-run the migration.')
      process.exit(1)
    }
  }

  console.log('\n✅ Done\n')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
