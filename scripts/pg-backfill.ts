/**
 * One-time bulk load: Mongo (products, apy.hourly, apy.daily, pipeline.reports) → Postgres.
 *
 * Decomposition: denormalized columns (provider/chain/asset/kind) live ONLY in
 * products, read straight from the product documents. apy rows carry just
 * product_id, so they need no decomposition. apy rows whose productId is absent
 * from products (orphans) are skipped and counted.
 *
 * Uses the neon HTTP client (sql.query) — single statements, no WebSocket.
 * Batch size keeps param count under Postgres's 65535 limit (2000 × ≤23 cols).
 *
 * Run: pnpm db:backfill   (needs MONGODB_URI, MONGODB_DB_NAME, DATABASE_URL_UNPOOLED)
 */
import { Pool } from '@neondatabase/serverless'
import { MongoClient } from 'mongodb'

import { requireDirectDatabaseUrl } from '../src/lib/db/env'

type Row = Record<string, unknown>
// WebSocket Pool speaks the real PG wire protocol — no HTTP payload cap,
// so large multi-row batches (up to Postgres's 65535-param limit) work.
type SqlClient = Pool

const BATCH = 2000

/** Build "($1,$2,...),($n,...)" placeholders; mark jsonbCols (0-based col idx) with ::jsonb. */
function placeholders(rowCount: number, colCount: number, jsonbCols: number[]): string {
  const tuples: string[] = []
  for (let r = 0; r < rowCount; r++) {
    const base = r * colCount
    const ph: string[] = []
    for (let c = 0; c < colCount; c++) {
      ph.push(jsonbCols.includes(c) ? `$${base + c + 1}::jsonb` : `$${base + c + 1}`)
    }
    tuples.push(`(${ph.join(',')})`)
  }
  return tuples.join(',')
}

async function backfillProducts(
  mdb: import('mongodb').Db,
  sql: SqlClient,
  productIds: Set<string>
): Promise<void> {
  const cols =
    'id,active,kind,provider,product_type,version,protocol_name,chain_id,chain_name,asset_symbol,asset_name,asset_address,asset_decimals,protocol_address,subgraph_url,meta,collaterals,created_at,updated_at'
  const docs = await mdb.collection('products').find({}).toArray()
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH)
    const params: unknown[] = []
    for (const p of chunk as Row[]) {
      const proto = p.protocol as Row
      const chain = proto.chain as Row
      const asset = p.asset as Row
      productIds.add(p._id as string)
      params.push(
        p._id,
        p.active ?? true,
        p.kind,
        proto.provider,
        proto.type,
        proto.version,
        proto.name,
        chain.id,
        chain.name,
        asset.symbol,
        asset.name,
        asset.address,
        asset.decimals,
        proto.address,
        proto.subgraphUrl ?? null,
        JSON.stringify(proto.meta ?? {}),
        p.collaterals ? JSON.stringify(p.collaterals) : null,
        p.createdAt ?? new Date(),
        p.updatedAt ?? new Date()
      )
    }
    const vals = placeholders(chunk.length, 19, [15, 16])
    await sql.query(
      `INSERT INTO products (${cols}) VALUES ${vals} ON CONFLICT (id) DO NOTHING`,
      params
    )
  }
  console.log(`products: ${docs.length}`)
}

async function copyApy(
  mdb: import('mongodb').Db,
  sql: SqlClient,
  src: string,
  dst: 'apy_hourly' | 'apy_daily',
  timeField: 'hour' | 'date',
  productIds: Set<string>
): Promise<void> {
  const isHourly = dst === 'apy_hourly'
  const cols = isHourly
    ? 'product_id,hour,apy_base,apy_rewards,apy_fees,apy_net,reward_items,supply_assets,supply_assets_usd,utilization_rate,asset_price_usd,borrow_assets,borrow_assets_usd,collateral_assets_usd,price_collateral_in_loan_asset,quality_count,quality_expected_count,quality_first_slot,quality_last_slot,quality_status,healed,heal_source,healed_from'
    : 'product_id,date,apy_base,apy_rewards,apy_fees,apy_net,reward_items,supply_assets,supply_assets_usd,utilization_rate,asset_price_usd,borrow_assets,borrow_assets_usd,collateral_assets_usd,price_collateral_in_loan_asset,quality_actual_count,quality_expected_count,quality_completeness,quality_status,quality_revision,quality_computed_at'
  const colCount = isHourly ? 23 : 21
  const conflict = isHourly ? '(product_id, hour)' : '(product_id, date)'

  const cursor = mdb.collection(src).find({})
  let batch: Row[] = []
  let total = 0
  let orphans = 0

  const flush = async () => {
    if (batch.length === 0) return
    const params: unknown[] = []
    for (const d of batch) {
      const apy = d.apy as Row
      const m = (d.market ?? {}) as Row
      const q = (d.quality ?? {}) as Row
      const common = [
        d.productId,
        d[timeField],
        apy.base,
        apy.rewards,
        apy.fees,
        apy.net,
        JSON.stringify(apy.rewardItems ?? []),
        m.supplyAssets ?? null,
        m.supplyAssetsUsd ?? null,
        m.utilizationRate ?? null,
        m.assetPriceUsd ?? null,
        m.borrowAssets ?? null,
        m.borrowAssetsUsd ?? null,
        m.collateralAssetsUsd ?? null,
        m.priceCollateralInLoanAsset ?? null,
      ]
      const tail = isHourly
        ? [
            q.count ?? 6,
            6,
            q.firstSlot ?? d.hour,
            q.lastSlot ?? d.hour,
            q.status ?? 'complete',
            d.healed ?? false,
            d.healSource ?? null,
            d.healedFrom ?? null,
          ]
        : [
            q.actualCount ?? 24,
            24,
            q.completeness ?? 1,
            q.status ?? 'complete',
            q.revision ?? 0,
            q.computedAt ?? new Date(),
          ]
      params.push(...common, ...tail)
    }
    const vals = placeholders(batch.length, colCount, [6]) // reward_items is col index 6
    await sql.query(
      `INSERT INTO ${dst} (${cols}) VALUES ${vals} ON CONFLICT ${conflict} DO NOTHING`,
      params
    )
    total += batch.length
    batch = []
  }

  for await (const doc of cursor) {
    if (!productIds.has(doc.productId)) {
      orphans++
      continue
    }
    batch.push(doc as Row)
    if (batch.length >= BATCH) await flush()
  }
  await flush()
  console.log(`${src}: ${total} rows (${orphans} orphans skipped)`)
}

async function main(): Promise<void> {
  const mongo = new MongoClient(process.env.MONGODB_URI!)
  await mongo.connect()
  const mdb = mongo.db(process.env.MONGODB_DB_NAME!)
  const sql = new Pool({ connectionString: requireDirectDatabaseUrl() })

  const productIds = new Set<string>()
  await backfillProducts(mdb, sql, productIds)
  await copyApy(mdb, sql, 'apy.hourly', 'apy_hourly', 'hour', productIds)
  await copyApy(mdb, sql, 'apy.daily', 'apy_daily', 'date', productIds)

  const reports = await mdb.collection('pipeline.reports').find({}).toArray()
  for (const r of reports as Row[]) {
    await sql.query(
      `INSERT INTO pipeline_reports (type, created_at, payload) VALUES ($1,$2,$3::jsonb)`,
      [r.type, r.createdAt ?? new Date(), JSON.stringify(r)]
    )
  }
  console.log(`reports: ${reports.length}`)

  await sql.end()
  await mongo.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
