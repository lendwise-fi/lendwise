import type { FetchOpts } from '@/lib/protocols/core/types'

import { getBackstop, getFactoryDeployedPools } from './common/api'
import type { BlendDeployment } from './common/deployments'

/**
 * De-dupe (case-insensitive) and sort. OUTPUT is always UPPERCASE strkey:
 * `Address.fromString` (Stellar SDK) rejects the lowercase form, and these ids
 * flow straight into `PoolV{1,2}.load`. De-dup rule preserved from the earlier
 * discovery module.
 */
function dedupeUpper(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.toUpperCase()))].sort()
}

function warnSkipped(deployment: BlendDeployment, what: string, e: unknown) {
  console.warn(
    `[pools:blend_${deployment.label}] ${what} skipped: ` +
      `${e instanceof Error ? e.message : e}`
  )
}

/**
 * blendPoolIds — the one pool-id set, for every Blend caller.
 *
 * Blend has no full on-chain enumeration (the factory has is_pool/deploy only,
 * no get_pools; blend-sdk 3.3 ships no PoolFactoryV2 reader — verified
 * 2026-08-29). Two partial on-chain sources exist: the backstop's reward zone
 * (the pools earning emissions, whatever their age) and the factory's Deploy
 * events (every pool, but the RPC retains only ~7 days of them). So the caller
 * (pipeline) injects the KNOWN set from the `products` catalogue via
 * opts.poolIds — same shape as getApyHistory(targets) — and this module
 * unions it, for getProducts only, with both.
 *
 *   getProducts (mode 'catalogue') = known ∪ reward zone ∪ getEvents(7d)
 *     — the reward zone seeds a deployment the catalogue has never seen (v2.1
 *       on its first sync), the scan catches a pool minted this week
 *   getApySpot  (mode 'spot')      = known only
 *     — the catalogue is authoritative for what to collect; a pool we collect
 *       but never catalogue writes orphan apy_hourly rows (the aave war story
 *       in aave/v3/listing.ts, the dangerous direction). A brand-new pool is
 *       catalogued by the hourly sync and collected on the next 10-min tick;
 *       the only observable gap is a ≤1h window right after a deploy.
 */
export async function blendPoolIds(
  deployment: BlendDeployment,
  opts: FetchOpts | undefined,
  mode: 'catalogue' | 'spot'
): Promise<string[]> {
  const known = opts?.poolIds ?? []

  if (mode === 'spot') return dedupeUpper(known)

  // getProducts only. ANY failure — a refusal, a malformed event — degrades
  // its term to `[]` and the union proceeds on the rest. Nothing corrupt is
  // written; a missed pool self-heals via `enumerate`'s retry or the next
  // hourly run. So, unlike `getPoolPrices`, a refusal here must NOT abort the
  // sync.
  const backstop = await getBackstop({ deployment }).catch((e) => {
    warnSkipped(deployment, 'backstop', e)
    return null
  })
  const rewardZone = backstop?.config.rewardZone ?? []
  const fresh = backstop
    ? await getFactoryDeployedPools(backstop.config.poolFactory).catch((e) => {
        warnSkipped(deployment, 'getEvents', e)
        return [] as string[]
      })
    : []

  return dedupeUpper([...known, ...rewardZone, ...fresh])
}
