/**
 * One-off Blend catalogue bootstrap — seeds the `products` table from Hubble.
 *
 * WHEN TO RUN THIS: a fresh environment, or after the Blend `products` rows
 * have been purged. Not a cron job.
 *
 * In steady state the hourly products sync is enough: the Blend adapter's
 * `getProducts` enumerates from the injected catalogue set unioned with a fresh
 * factory `Deploy` scan (`getFactoryDeployedPools`, ~7-day RPC retention). That
 * cannot see the ~11 pools deployed months ago when `products` is empty — the
 * RPC no longer serves those events. Hubble's `history_contract_events` mirror
 * carries the full `Deploy` history and fills that gap exactly once.
 *
 * Idempotent: every write is an upsert on the deterministic product slug id.
 *
 * Usage:
 *   pnpm blend:bootstrap
 */
import { getBigQueryClient } from '@/lib/bigquery/client'
import {
  syncProviderProducts,
  upsertProducts,
} from '@/lib/db/repositories/products'
import { getBackstop } from '@/lib/protocols/blend/common/api'
import { BLEND_PROVIDER } from '@/lib/protocols/blend/common/config'
import { BLEND_DEPLOYMENTS } from '@/lib/protocols/blend/common/deployments'
import { fetchBlendPoolDeploys } from '@/lib/protocols/blend/common/hubble'
import { fetchBlendV2Products } from '@/lib/protocols/blend/v2/products'

/**
 * The deployments LendWise collects — the ones registered in
 * `src/config/protocols-server.ts`. v1 and v2 are retired (every pool frozen
 * or on ice); seeding them would reopen what `retire-products.ts` closed.
 */
const DEPLOYMENTS = [BLEND_DEPLOYMENTS['v2.1']]

async function main(): Promise<void> {
  console.log('\n🔄 Blend catalogue bootstrap (Hubble)\n')

  const client = getBigQueryClient()
  if (!client) {
    console.error(
      '❌ BigQuery client unavailable — set GCP_PROJECT and ' +
        'GCP_SERVICE_ACCOUNT_BASE64 (base64-encoded service-account JSON) in ' +
        'the environment.'
    )
    process.exit(1)
  }

  // Factory addresses are read off the backstops, never hardcoded.
  const backstops = await Promise.all(
    DEPLOYMENTS.map((deployment) => getBackstop({ deployment }))
  )
  const factories = Object.fromEntries(
    DEPLOYMENTS.map((d, i) => [d.label, backstops[i].config.poolFactory])
  )

  const deploys = await fetchBlendPoolDeploys(client, factories)
  console.log(
    `  Hubble Deploy events: ${DEPLOYMENTS.map((d) => `${deploys[d.label].length} ${d.label}`).join(', ')} ` +
      '(includes never-launched redeployments — filtered on load)\n'
  )

  if (Object.values(deploys).every((ids) => ids.length === 0)) {
    console.warn(
      '⚠️  Hubble returned no Deploy events for any factory. Check the ' +
        'factory addresses read off the backstops, or the query. Leaving ' +
        '`products` untouched.\n'
    )
    process.exit(0)
  }

  // `fetchBlendV2Products` loads each pool over RPC and drops status-6
  // (Setup / never-launched) pools, so the ghost redeployments Hubble surfaces
  // are discarded here. Every collected deployment runs the v2 pool contract.
  const perDeployment = await Promise.all(
    DEPLOYMENTS.map((d) =>
      fetchBlendV2Products(d, { poolIds: deploys[d.label] })
    )
  )

  const allProducts = perDeployment.flat()
  console.log(
    `  Live products: ${DEPLOYMENTS.map((d, i) => `${perDeployment[i].length} ${d.label}`).join(' + ')} ` +
      `= ${allProducts.length}\n`
  )

  if (allProducts.length === 0) {
    console.warn(
      '⚠️  Nothing to seed — every pool Hubble returned is never-launched ' +
        '(status 6). Leaving `products` untouched.\n'
    )
    process.exit(0)
  }

  await upsertProducts(allProducts)

  // ONE reconciliation call spanning every collected deployment. A
  // per-deployment call would read the others' absent ids as "delisted" and
  // close their periods.
  const fetchedIds = allProducts.map((p) => p._id)
  const r = await syncProviderProducts(BLEND_PROVIDER, fetchedIds, new Date())

  console.log('📊 Result:')
  console.log(`  Products upserted:  ${allProducts.length}`)
  console.log(`  Periods activated:  ${r.activated}`)
  console.log(`  Periods closed:     ${r.deactivated}`)
  console.log(`  Unchanged:          ${r.unchanged}`)
  console.log('\n✅ Done\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
