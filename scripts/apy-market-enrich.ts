/**
 * @file scripts/apy-market-enrich.ts
 * Enrich historical market data (TVL, utilization, asset price) in apy.daily.
 *
 * Reads documents where quality.status='historical' and market.assetPriceUsd=0,
 * fetches missing data from DeFiLlama, and patches documents via bulkWrite $set.
 *
 * Adapters per protocol live in src/lib/protocols/{name}/market-enrich.ts
 *
 * Usage:
 *   pnpm apy:enrich-market
 *   pnpm apy:enrich-market -- --protocol aave
 *   pnpm apy:enrich-market -- --chain polygon
 *   pnpm apy:enrich-market -- --dry-run
 *   pnpm apy:enrich-market -- --db-name yieldoptimizer_test
 */
import type { Collection } from 'mongodb'
import { MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_DB_NAME,
  MONGODB_URI,
} from '@/lib/db/mongodb'
import { batchedMap } from '@/lib/defillama'
import { aaveV3Adapter } from '@/lib/protocols/aave/v3/market-enrich'
import type {
  EnrichAdapter,
  MarketPatch,
  RawDailyDoc,
} from '@/lib/protocols/enrich-adapter'

// ─── Adapter registry ─────────────────────────────────────────────────────────
// Keys match productIdPrefix exactly — used as --protocol argument.
// Add new adapters here as they are implemented.

const ALL_ADAPTERS: EnrichAdapter[] = [
  aaveV3Adapter,
  // morphoV1Adapter,
  // compoundV3Adapter,
]

const ADAPTERS: Record<string, EnrichAdapter> = Object.fromEntries(
  ALL_ADAPTERS.map((a) => [a.productIdPrefix, a])
)

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  const has = (flag: string) => args.includes(flag)
  return {
    protocol: get('--protocol'), // productIdPrefix, e.g. "aave:v3"
    chain: get('--chain'),
    dbName: get('--db-name') ?? MONGODB_DB_NAME,
    dryRun: has('--dry-run'),
  }
}

// ─── MongoDB batch writer ─────────────────────────────────────────────────────

async function batchUpdate(
  collection: Collection<MarketPatch>,
  patches: MarketPatch[],
  log: Logger
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

type Logger = (msg: string) => void

// ─── Per-adapter enrichment run ───────────────────────────────────────────────

async function runAdapter(
  adapter: EnrichAdapter,
  collection: Collection,
  chain: string | undefined,
  dryRun: boolean,
  log: Logger
): Promise<{ found: number; patched: number }> {
  const prefix = adapter.productIdPrefix
  const productIdFilter = chain
    ? new RegExp(`^${prefix}:${chain}:`)
    : new RegExp(`^${prefix}:`)

  const rawDocs = (await collection
    .find(
      {
        'quality.status': 'historical',
        productId: productIdFilter,
        'market.assetPriceUsd': 0,
      },
      { projection: { _id: 1, productId: 1, date: 1 } }
    )
    .toArray()) as unknown as RawDailyDoc[]

  log(`\n[${adapter.name}] Found ${rawDocs.length} documents to enrich`)

  if (rawDocs.length === 0) return { found: 0, patched: 0 }

  // Group by adapter key (e.g. chain:tokenAddress for Aave)
  const groups = new Map<string, RawDailyDoc[]>()
  let skipped = 0
  for (const doc of rawDocs) {
    const key = adapter.getGroupKey(doc)
    if (!key) {
      skipped++
      continue
    }
    const arr = groups.get(key) ?? []
    arr.push(doc)
    groups.set(key, arr)
  }

  if (skipped > 0) log(`[${adapter.name}] Skipped ${skipped} unparseable docs`)
  log(`[${adapter.name}] Grouped into ${groups.size} unique keys\n`)

  // Enrich in batches of 5 concurrent groups
  const groupList = [...groups.values()]
  const nestedPatches = await batchedMap(
    groupList,
    (docs) => adapter.enrichGroup(docs, log),
    5,
    300
  )

  const allPatches = (nestedPatches.flat() as MarketPatch[]).filter(Boolean)

  log(
    `\n[${adapter.name}] Patches computed: ${allPatches.length} / ${rawDocs.length - skipped}`
  )

  if (dryRun || allPatches.length === 0)
    return { found: rawDocs.length, patched: 0 }

  const modified = await batchUpdate(
    collection as unknown as Collection<MarketPatch>,
    allPatches,
    log
  )
  return { found: rawDocs.length, patched: modified }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { protocol, chain, dbName, dryRun } = parseArgs()
  const log = console.log

  // Resolve which adapters to run
  const adaptersToRun: EnrichAdapter[] = protocol
    ? (() => {
        const a = ADAPTERS[protocol]
        if (!a) {
          console.error(
            `Unknown protocol "${protocol}". Valid options: ${Object.keys(ADAPTERS).join(', ')}`
          )
          process.exit(1)
        }
        return [a]
      })()
    : Object.values(ADAPTERS)

  log('\n📊 APY Historical Market Data Enrichment\n')
  log(`  Database:  ${dbName}`)
  log(
    `  Protocol:  ${protocol ?? 'all'} (${adaptersToRun.map((a) => a.name).join(', ')})`
  )
  log(`  Chain:     ${chain ?? 'all'}`)
  log(`  Dry run:   ${dryRun}\n`)

  const client = new MongoClient(MONGODB_URI!)
  try {
    await client.connect()
    const collection = client.db(dbName).collection(MONGODB_COLLECTION_DAILY!)

    let totalFound = 0
    let totalPatched = 0

    for (const adapter of adaptersToRun) {
      const { found, patched } = await runAdapter(
        adapter,
        collection,
        chain,
        dryRun,
        log
      )
      totalFound += found
      totalPatched += patched
    }

    log(`\n📈 Summary:`)
    log(`  Documents found:  ${totalFound}`)

    if (dryRun) {
      log('\n🔒 Dry run — no data written to database\n')
    } else {
      log(`  Documents patched: ${totalPatched}`)
      log('\n✅ Enrichment complete\n')
    }
  } catch (err) {
    console.error('\n❌ Enrichment failed:', err)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Unexpected error:', err)
    process.exit(1)
  })
