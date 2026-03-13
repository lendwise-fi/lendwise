/**
 * @file scripts/pools-sync.ts
 * Manual trigger for the pools sync job.
 *
 * Usage:
 *   bun run --env-file=.env pools:sync
 *   bun run --env-file=.env pools:sync -- --protocol aave_v3
 *   bun run --env-file=.env pools:sync -- --protocol morpho_v1
 */

import { syncPools } from '@/app/actions/pools-sync.actions'
import type { ProtocolName } from '@/config/protocols'

async function main(): Promise<void> {
  const args     = process.argv.slice(2)
  const protoIdx = args.indexOf('--protocol')
  const protocol = protoIdx !== -1 ? (args[protoIdx + 1] as ProtocolName) : undefined

  console.log('\n🔄 Kompo — Pools sync\n')
  if (protocol) {
    console.log(`  Protocol: ${protocol}\n`)
  } else {
    console.log('  Protocol: all\n')
  }

  const result = await syncPools(protocol)

  console.log('\n📊 Result:')
  console.log(`  Success:  ${result.success}`)
  console.log(`  Total:    ${result.counts.total}`)
  console.log(`  Duration: ${result.durationMs}ms`)

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:')
    result.errors.forEach((e) => console.log(`  ${e}`))
    process.exit(1)
  }

  console.log('\n✅ Done\n')
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})