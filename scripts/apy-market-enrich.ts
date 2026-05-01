/**
 * @file scripts/apy-market-enrich.ts
 * Enrich historical Aave V3 market data in apy.daily collection.
 *
 * Reads documents where quality.status='historical' and productId starts with
 * 'aave:v3' that have zero market data, then fetches historical TVL, utilization,
 * and price data from DeFiLlama to populate the market fields.
 *
 * Usage:
 *   pnpm apy:enrich-market
 *   pnpm apy:enrich-market -- --chain polygon
 *   pnpm apy:enrich-market -- --dry-run
 *   pnpm apy:enrich-market -- --db-name yieldoptimizer_test
 */
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import type { Collection, Document } from 'mongodb'
import { MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_DB_NAME,
  MONGODB_URI,
} from '@/lib/db/mongodb'
import type { BorrowMarketState, SupplyMarketState } from '@/lib/db/types'
import {
  batchedMap,
  fetchAaveV3Pools,
  fetchPoolYieldHistory,
  fetchTokenPriceHistory,
  findPool,
} from '@/lib/defillama'

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  const has = (flag: string) => args.includes(flag)
  return {
    chain: get('--chain'),
    dbName: get('--db-name') ?? MONGODB_DB_NAME,
    dryRun: has('--dry-run'),
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedDoc = {
  _id: string
  productId: string
  date: Date
  chain: string
  tokenAddress: string
  kind: 'supply' | 'borrow'
  dateStr: string
}

// ─── productId parser ─────────────────────────────────────────────────────────

function parseDoc(raw: {
  _id: string
  productId: string
  date: Date
}): ParsedDoc | null {
  // _id format: "aave:v3:{chain}:reserve:{tokenAddress}:{kind}:{YYYY-MM-DD}"
  const parts = raw._id.split(':')
  if (
    parts.length < 7 ||
    parts[0] !== 'aave' ||
    parts[1] !== 'v3' ||
    parts[3] !== 'reserve'
  ) {
    return null
  }
  const chain = parts[2]
  const tokenAddress = parts[4]
  const kind = parts[5] as 'supply' | 'borrow'
  const dateStr = parts[6]
  if (kind !== 'supply' && kind !== 'borrow') return null
  return {
    _id: raw._id,
    productId: raw.productId,
    date: raw.date,
    chain,
    tokenAddress,
    kind,
    dateStr,
  }
}

// ─── Price and yield helpers ──────────────────────────────────────────────────

function buildPriceMap(
  prices: { timestamp: number; price: number }[]
): Map<string, number> {
  const map = new Map<string, number>()
  for (const pt of prices) {
    const key = new Date(pt.timestamp * 1000).toISOString().slice(0, 10)
    map.set(key, pt.price)
  }
  return map
}

function findNearestPrice(
  map: Map<string, number>,
  dateStr: string
): number | undefined {
  if (map.has(dateStr)) return map.get(dateStr)
  const target = new Date(dateStr).getTime()
  let best: number | undefined
  let bestDelta = Infinity
  for (const [key, price] of map) {
    const delta = Math.abs(new Date(key).getTime() - target)
    if (delta < bestDelta && delta <= 86_400_000) {
      bestDelta = delta
      best = price
    }
  }
  return best
}

function buildYieldMap(
  points: {
    timestamp: string
    totalSupplyUsd: number | null
    totalBorrowUsd: number | null
    tvlUsd: number
    utilization: number | null
  }[]
): Map<string, { supplyUsd: number; borrowUsd: number; utilization: number }> {
  const map = new Map<
    string,
    { supplyUsd: number; borrowUsd: number; utilization: number }
  >()
  for (const pt of points) {
    const key = pt.timestamp.slice(0, 10)
    map.set(key, {
      supplyUsd: pt.totalSupplyUsd ?? pt.tvlUsd,
      borrowUsd: pt.totalBorrowUsd ?? 0,
      utilization: pt.utilization ?? 0,
    })
  }
  return map
}

// ─── Market state builders ────────────────────────────────────────────────────

function buildSupplyMarket(
  supplyAssetsUsd: number,
  utilizationRate: number,
  assetPriceUsd: number
): SupplyMarketState {
  return {
    supplyAssets: assetPriceUsd > 0 ? supplyAssetsUsd / assetPriceUsd : 0,
    supplyAssetsUsd,
    utilizationRate,
    assetPriceUsd,
  }
}

function buildBorrowMarket(
  supplyAssetsUsd: number,
  borrowAssetsUsd: number,
  utilizationRate: number,
  assetPriceUsd: number
): BorrowMarketState {
  return {
    supplyAssets: assetPriceUsd > 0 ? supplyAssetsUsd / assetPriceUsd : 0,
    supplyAssetsUsd,
    borrowAssets: assetPriceUsd > 0 ? borrowAssetsUsd / assetPriceUsd : 0,
    borrowAssetsUsd,
    utilizationRate,
    assetPriceUsd,
    collateralAssetsUsd: null,
    priceCollateralInLoanAsset: null,
  }
}

// ─── Enrichment per token group ───────────────────────────────────────────────

async function enrichTokenGroup(
  docs: ParsedDoc[],
  pools: Awaited<ReturnType<typeof fetchAaveV3Pools>>,
  log: (msg: string) => void
): Promise<Document[]> {
  const { chain, tokenAddress } = docs[0]

  const pool = findPool(pools, chain, tokenAddress)
  if (!pool) {
    log(
      `[warn] No DeFiLlama pool for ${chain}:${tokenAddress} — skipping ${docs.length} docs`
    )
    return []
  }

  const yieldHistory = await fetchPoolYieldHistory(pool.pool)
  if (yieldHistory.length === 0) {
    log(
      `[warn] Empty yield history for pool ${pool.pool} (${pool.symbol}@${pool.chain})`
    )
    return []
  }

  const dates = docs.map((d) => new Date(d.dateStr).getTime())
  const startUnix = Math.floor(Math.min(...dates) / 1000)
  const endUnix = Math.floor(Math.max(...dates) / 1000)
  const days = Math.ceil((endUnix - startUnix) / 86400) + 7

  const priceHistory = await fetchTokenPriceHistory(
    chain,
    tokenAddress,
    startUnix,
    days
  )

  const yieldMap = buildYieldMap(yieldHistory)
  const priceMap = buildPriceMap(priceHistory)

  log(
    `[info] ${pool.symbol}@${pool.chain}: ${yieldHistory.length} yield days, ${priceHistory.length} price days → enriching ${docs.length} docs`
  )

  const patches: Document[] = []

  for (const doc of docs) {
    const yieldPt = yieldMap.get(doc.dateStr)
    const price = findNearestPrice(priceMap, doc.dateStr)

    if (!yieldPt || price === undefined) {
      log(`[warn] Missing DeFiLlama data for ${doc._id} — skipping`)
      continue
    }

    const market =
      doc.kind === 'supply'
        ? buildSupplyMarket(yieldPt.supplyUsd, yieldPt.utilization, price)
        : buildBorrowMarket(
            yieldPt.supplyUsd,
            yieldPt.borrowUsd,
            yieldPt.utilization,
            price
          )

    patches.push({ _id: doc._id, market })
  }

  return patches
}

// ─── MongoDB batch writer ─────────────────────────────────────────────────────

async function batchUpdate(
  collection: Collection,
  patches: Document[],
  log: (msg: string) => void
): Promise<number> {
  let modified = 0
  const batchSize = 500
  for (let i = 0; i < patches.length; i += batchSize) {
    const batch = patches.slice(i, i + batchSize)
    const ops = batch.map((p) => ({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { market: p.market } },
        upsert: false,
      },
    }))
    const result = await collection.bulkWrite(ops, { ordered: false })
    modified += result.modifiedCount
    log(
      `  batch ${Math.floor(i / batchSize) + 1}: ${result.modifiedCount} modified`
    )
  }
  return modified
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { chain, dbName, dryRun } = parseArgs()
  const log = console.log

  log('\n📊 Aave Historical Market Data Enrichment\n')
  log(`  Database:  ${dbName}`)
  log(`  Chain:     ${chain ?? 'all'}`)
  log(`  Dry run:   ${dryRun}`)
  log()

  const client = new MongoClient(MONGODB_URI!)
  try {
    await client.connect()
    const db = client.db(dbName)
    const collection = db.collection(MONGODB_COLLECTION_DAILY!)

    const productIdFilter = chain
      ? new RegExp(`^aave:v3:${chain}:`)
      : /^aave:v3:/

    const filter = {
      'quality.status': 'historical',
      productId: productIdFilter,
      'market.assetPriceUsd': 0,
    }

    const rawDocs = await collection
      .find(filter, { projection: { _id: 1, productId: 1, date: 1 } })
      .toArray()

    log(`Found ${rawDocs.length} documents to enrich\n`)

    if (rawDocs.length === 0) {
      log('✅ Nothing to enrich.\n')
      return
    }

    const parsed: ParsedDoc[] = []
    for (const raw of rawDocs) {
      const p = parseDoc(
        raw as unknown as { _id: string; productId: string; date: Date }
      )
      if (p) parsed.push(p)
      else log(`[warn] Cannot parse _id: ${raw._id} — skipping`)
    }

    const groups = new Map<string, ParsedDoc[]>()
    for (const doc of parsed) {
      const key = `${doc.chain}:${doc.tokenAddress}`
      const arr = groups.get(key) ?? []
      arr.push(doc)
      groups.set(key, arr)
    }

    log(`Grouped into ${groups.size} unique tokens\n`)
    log('🔵 Fetching DeFiLlama pool list...')
    const pools = await fetchAaveV3Pools()
    log(`  Found ${pools.length} Aave V3 pools\n`)

    const tokenGroups = [...groups.values()]
    const allPatchesNested = await batchedMap(
      tokenGroups,
      (docs) => enrichTokenGroup(docs, pools, log),
      5,
      300
    )

    const allPatches = (allPatchesNested.flat() as Document[]).filter(Boolean)

    log(`\n📈 Summary:`)
    log(`  Documents found:  ${rawDocs.length}`)
    log(`  Patches computed: ${allPatches.length}`)
    log(`  Skipped:          ${rawDocs.length - allPatches.length}`)

    if (dryRun) {
      log('\n🔒 Dry run — no data written to database')
      if (allPatches.length > 0) {
        const sample = allPatches[0]
        log('\n  Sample patch:')
        log(`    _id:             ${sample._id}`)
        log(`    assetPriceUsd:   ${sample.market.assetPriceUsd}`)
        log(`    supplyAssetsUsd: ${sample.market.supplyAssetsUsd}`)
        log(`    utilizationRate: ${sample.market.utilizationRate}`)
      }
      log('\n✅ Dry run complete\n')
      return
    }

    log('\n💾 Writing to database...')
    const modified = await batchUpdate(collection, allPatches, log)
    log(`\n✅ Enrichment complete — ${modified} documents updated\n`)
  } catch (err) {
    console.error('\n❌ Enrichment failed:', err)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
