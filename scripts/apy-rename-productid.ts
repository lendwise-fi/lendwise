/**
 * @file scripts/apy-rename-productid.ts
 * Rename productId slugs in apy.hourly and apy.daily.
 *
 * Fixes a historical bug where chain.name (e.g. 'EthereumLido') was used
 * instead of the Aave deployment name (e.g. 'AaveV3EthereumLido'), producing
 * productIds like 'aave:v3:ethereumlido:...' instead of 'aave:v3:ethereum-lido:...'.
 *
 * Usage:
 *   pnpm apy:rename-productid
 *   pnpm apy:rename-productid -- --dry-run
 *   pnpm apy:rename-productid -- --db-name yieldoptimizer_test
 */
import { MongoClient } from 'mongodb'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_DB_NAME,
  MONGODB_URI,
} from '@/lib/db/mongodb'

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  return {
    dbName: get('--db-name') ?? MONGODB_DB_NAME,
    dryRun: args.includes('--dry-run'),
  }
}

// ─── Rename rules ─────────────────────────────────────────────────────────────

const RENAMES: [string, string][] = [
  ['aave:v3:ethereumlido:', 'aave:v3:ethereum-lido:'],
  ['aave:v3:ethereumetherfi:', 'aave:v3:ethereum-etherfi:'],
  ['aave:v3:ethereumhorizon:', 'aave:v3:ethereum-horizon:'],
]

// ─── Migration ────────────────────────────────────────────────────────────────

async function migrateCollection(
  client: MongoClient,
  dbName: string,
  collectionName: string,
  dryRun: boolean,
  log: (msg: string) => void
): Promise<number> {
  const col = client.db(dbName).collection(collectionName)
  let total = 0

  for (const [from, to] of RENAMES) {
    const filter = { productId: new RegExp('^' + from.replace(/:/g, '\\:')) }
    const count = await col.countDocuments(filter)

    if (count === 0) continue

    log(`  ${collectionName}: ${count} docs  ${from}* → ${to}*`)

    if (dryRun) { total += count; continue }

    const result = await col.updateMany(filter, [
      { $set: { productId: { $replaceAll: { input: '$productId', find: from, replacement: to } } } },
    ])

    log(`    → ${result.modifiedCount} updated`)
    total += result.modifiedCount
  }

  return total
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dbName, dryRun } = parseArgs()
  const log = console.log

  log('\n🔄 Aave ProductId Rename Migration\n')
  log(`  Database: ${dbName}`)
  log(`  Dry run:  ${dryRun}\n`)

  const client = new MongoClient(MONGODB_URI!)

  try {
    await client.connect()

    const hourly = await migrateCollection(client, dbName, MONGODB_COLLECTION_HOURLY!, dryRun, log)
    const daily = await migrateCollection(client, dbName, MONGODB_COLLECTION_DAILY!, dryRun, log)

    log()
    if (dryRun) {
      log(`🔒 Dry run — no changes written`)
      log(`   Would rename: ${hourly + daily} documents total`)
    } else {
      log(`✅ Done — ${hourly} hourly + ${daily} daily documents updated`)
    }
    log()
  } catch (err) {
    console.error('\n❌ Migration failed:', err)
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
