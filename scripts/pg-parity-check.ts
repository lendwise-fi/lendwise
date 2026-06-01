/**
 * Compares Mongo vs Postgres after backfill:
 *   1. row counts per collection/table
 *   2. spot-check 20 random products: latest hourly apy.net within 1e-9
 *   3. EXPLAIN ANALYZE the columnar daily query and print timing
 *      (this is the query the GraphQL resolver runs — Mongo measured at 3098 ms)
 * Run: pnpm db:parity   (needs MONGODB_URI, MONGODB_DB_NAME, DATABASE_URL_UNPOOLED)
 */
import { Pool } from '@neondatabase/serverless'
import { MongoClient } from 'mongodb'

import { requireDirectDatabaseUrl } from '../src/lib/db/env'

async function main(): Promise<void> {
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  const mdb = mongo.db(process.env.MONGODB_DB_NAME!)
  const pool = new Pool({ connectionString: requireDirectDatabaseUrl() })

  // ── 1. counts ──────────────────────────────────────────────────────────────
  const pairs: [string, string][] = [
    ['products', 'products'],
    ['apy.hourly', 'apy_hourly'],
    ['apy.daily', 'apy_daily'],
  ]
  for (const [m, p] of pairs) {
    const mc = await mdb.collection(m).countDocuments()
    const pc = Number((await pool.query(`SELECT count(*)::int AS n FROM ${p}`)).rows[0].n)
    const delta = mc - pc
    console.log(`${m}: mongo=${mc} pg=${pc} ${delta === 0 ? 'OK' : `DELTA ${delta} (orphans/window)`}`)
  }

  // ── 2. sample latest-hourly parity ──────────────────────────────────────────
  const sample = (await mdb
    .collection('products')
    .aggregate([{ $sample: { size: 20 } }, { $project: { _id: 1 } }])
    .toArray()) as { _id: string }[]
  let mism = 0
  let checked = 0
  for (const s of sample) {
    const md = await mdb
      .collection('apy.hourly')
      .find({ productId: s._id })
      .sort({ hour: -1 })
      .limit(1)
      .toArray()
    const pd = (
      await pool.query('SELECT apy_net FROM apy_hourly WHERE product_id=$1 ORDER BY hour DESC LIMIT 1', [s._id])
    ).rows
    if (md[0] && pd[0]) {
      checked++
      if (Math.abs((md[0] as unknown as { apy: { net: number } }).apy.net - pd[0].apy_net) > 1e-9) {
        mism++
        console.warn(`mismatch ${s._id}: mongo=${(md[0] as unknown as { apy: { net: number } }).apy.net} pg=${pd[0].apy_net}`)
      }
    }
  }
  console.log(`sample mismatches: ${mism}/${checked} checked`)

  // ── 3. explain the resolver's default daily query ───────────────────────────
  const plan = await pool.query(`EXPLAIN ANALYZE
    SELECT h.* FROM apy_daily h JOIN products p ON p.id = h.product_id
    WHERE p.provider='aave' AND p.kind='supply' AND h.date >= now() - interval '30 days'
    ORDER BY h.date LIMIT 100`)
  console.log('\nDAILY QUERY PLAN (Mongo measured 3098 ms; target: index scan, single-digit ms):')
  console.log((plan.rows as { 'QUERY PLAN': string }[]).map((r) => r['QUERY PLAN']).join('\n'))

  await pool.end()
  await mongo.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
