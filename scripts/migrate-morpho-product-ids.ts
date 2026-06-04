/**
 * @file scripts/migrate-morpho-product-ids.ts
 * One-shot data migration: rewrite legacy Morpho productIds to the unified scheme.
 *
 *   metamorpho:v1:{chain}:vault:{addr}  →  morpho:v1:{chain}:vault:{addr}:supply
 *   morphoblue:v1:{chain}:market:{id}   →  morpho:v1:{chain}:market:{id}:borrow
 *
 * Rewrites the productId key in products.id, apy_hourly.product_id and
 * apy_daily.product_id. Idempotent — once the legacy prefixes are gone a re-run
 * is a no-op. No FK constraints couple these tables, so each table is processed
 * independently (neon-http has no interactive transactions).
 *
 * COLLISION HANDLING — once the new `morpho:` code is deployed, the live apy
 * cron writes new-scheme rows for the current hour(s). A legacy row and a fresh
 * new-scheme row can therefore share the same key (product_id, hour/date). For
 * each such collision we DELETE the legacy row (the new-scheme row is the one
 * the cron actively maintains) and rename only the non-colliding survivors.
 *
 * ⚠️  DEPLOY ORDERING — run AFTER deploying the code that emits the new scheme.
 *     Running it while the old code is still live re-creates legacy ids.
 *
 * Usage:
 *   pnpm run migrate:morpho-ids -- --dry   # preview counts, no writes
 *   pnpm run migrate:morpho-ids            # apply
 */
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const sql = neon(url)

// Fixed whitelist — table/column/key names are interpolated, so they must
// never come from external input. `keyCol` is the rest of the composite PK
// alongside the id column (null for products, whose PK is the id alone).
const TARGETS = [
  { table: 'products', col: 'id', keyCol: null },
  { table: 'apy_hourly', col: 'product_id', keyCol: 'hour' },
  { table: 'apy_daily', col: 'product_id', keyCol: 'date' },
] as const

const RULES = [
  { legacyPrefix: 'metamorpho:', kind: 'supply' },
  { legacyPrefix: 'morphoblue:', kind: 'borrow' },
] as const

type Target = (typeof TARGETS)[number]
type Rule = (typeof RULES)[number]

/** SQL expression mapping a legacy id (alias `a`) to its new-scheme id. */
function newIdExpr(target: Target, rule: Rule): string {
  // regexp_replace strips the anchored legacy prefix; the kind suffix is
  // appended to match buildProductId().
  return `regexp_replace(a.${target.col}, '^${rule.legacyPrefix}', 'morpho:') || ':${rule.kind}'`
}

/** Extra JOIN predicate so collisions compare on the full composite key. */
function keyPredicate(target: Target): string {
  return target.keyCol ? ` AND b.${target.keyCol} = a.${target.keyCol}` : ''
}

async function count(table: string, where: string): Promise<number> {
  const rows = (await sql.query(
    `SELECT count(*)::int AS n FROM ${table} ${where}`,
    []
  )) as { n: number }[]
  return rows[0].n
}

/** Legacy rows whose new-scheme target already exists at the same key. */
async function countCollisions(target: Target, rule: Rule): Promise<number> {
  const rows = (await sql.query(
    `SELECT count(*)::int AS n
       FROM ${target.table} a
       JOIN ${target.table} b
         ON b.${target.col} = ${newIdExpr(target, rule)}${keyPredicate(target)}
      WHERE a.${target.col} LIKE $1`,
    [`${rule.legacyPrefix}%`]
  )) as { n: number }[]
  return rows[0].n
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  console.log(`\n🔀 Morpho productId migration${dry ? ' (dry run)' : ''}\n`)

  for (const target of TARGETS) {
    const { table, col } = target
    for (const rule of RULES) {
      const like = `${rule.legacyPrefix}%`

      const legacy = await count(table, `WHERE ${col} LIKE '${like}'`)
      const collisions = await countCollisions(target, rule)
      const renames = legacy - collisions

      if (dry) {
        console.log(
          `  [dry] ${table}.${col}  ${rule.legacyPrefix}… → morpho:…:${rule.kind}` +
            `  legacy=${legacy} collisions=${collisions} renames=${renames}`
        )
        continue
      }
      if (legacy === 0) {
        console.log(
          `  ${table}.${col}  ${rule.legacyPrefix}… → morpho:…:${rule.kind}  nothing to do`
        )
        continue
      }

      // 1. Drop legacy rows whose new-scheme target already exists (collisions).
      if (collisions > 0) {
        await sql.query(
          `DELETE FROM ${table} a USING ${table} b
           WHERE a.${col} LIKE $1
             AND b.${col} = ${newIdExpr(target, rule)}${keyPredicate(target)}`,
          [like]
        )
      }

      // 2. Rename the surviving legacy rows. The NOT EXISTS guard makes this
      //    crash-proof against a cron tick that lands a fresh new-scheme row
      //    between the collision count above and this UPDATE — any straggler is
      //    simply left for the verification/re-run rather than erroring out.
      await sql.query(
        `UPDATE ${table} a
           SET ${col} = regexp_replace(a.${col}, $1, 'morpho:') || $2
         WHERE a.${col} LIKE $3
           AND NOT EXISTS (
             SELECT 1 FROM ${table} b
              WHERE b.${col} = regexp_replace(a.${col}, $1, 'morpho:') || $2
                ${keyPredicate(target)}
           )`,
        [`^${rule.legacyPrefix}`, `:${rule.kind}`, like]
      )

      console.log(
        `  ${table}.${col}  ${rule.legacyPrefix}… → morpho:…:${rule.kind}` +
          `  renamed=${renames} dropped_collisions=${collisions}`
      )
    }
  }

  // ─── Verify no legacy ids remain ──────────────────────────────────────────
  if (!dry) {
    console.log('\n🔎 Verification:')
    let leftover = 0
    for (const { table, col } of TARGETS) {
      const n = await count(
        table,
        `WHERE ${col} LIKE 'metamorpho:%' OR ${col} LIKE 'morphoblue:%'`
      )
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
