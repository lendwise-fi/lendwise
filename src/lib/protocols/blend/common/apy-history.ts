import {
  PoolConfig,
  ReserveConfig,
  ReserveConfigV2,
  ReserveData,
  ReserveV1,
  ReserveV2,
  Version,
} from '@blend-capital/blend-sdk'
import type { xdr } from '@stellar/stellar-sdk'

import { getBigQueryClient } from '@/lib/bigquery/client'
import type { BorrowMarketState, SupplyMarketState } from '@/lib/db/types'
import { requestedProducts } from '@/lib/protocols/core/history-result'
import type {
  HistoryDataPoint,
  HistoryParams,
  HistoryResult,
  HistoryTarget,
} from '@/lib/protocols/core/types'
import {
  type StellarHistoryBucket,
  type StellarHistoryDecoder,
  contractInstanceKey,
  fetchStellarHubbleHistory,
  ledgerKeyHash,
} from '@/lib/protocols/stellar/hubble-history'
import { aprToApyDaily } from '@/lib/utils'

import { BLEND_PROVIDER } from './config'
import type { BlendDeployment } from './deployments'

/**
 * Blend's decoder for the Hubble history module.
 *
 * A Blend reserve's rates are not stored on-chain: the pool stores the inputs
 * — `ResConfig(asset)` (the interest-rate curve), `ResData(asset)` (b/d
 * supplies and rates, the rate modifier, last accrual time) and the pool
 * `Config` in its instance storage (backstop take rate) — and computes the
 * rate from them on every call. So history is rebuilt the way the SDK builds
 * the live state: parse those three entries as they stood at the bucket's end,
 * accrue to that instant, read the rates.
 *
 * That is the same SDK path `apy-spot.ts` takes through `Pool.load`, and the
 * same APR→APY conversion, so a backfilled hour and a collected hour are
 * computed identically. Pools put On Ice or Frozen after the exploit still
 * hold this state, and it still accrues — their history reconstructs like any
 * other (verified on both Fixed pools, status 3, by the fixtures in
 * `__tests__/fixtures/`).
 *
 * Not reconstructed: BLND emissions (`rewards` is 0, `rewardItems` empty) and
 * USD values (no historical oracle read; `enrichPointsWithUsd` prices points
 * from another provider's same-day observation downstream).
 */

/** Blend mainnet launched after this; no pool storage predates it. */
const BLEND_STATE_SINCE = new Date('2024-05-01T00:00:00Z')

function metaString(target: HistoryTarget, key: string): string | null {
  const value = target.meta[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** The pool's backstop take rate (7 decimals), from its instance `Config`. */
function backstopTakeRate(instance: xdr.ScVal): bigint | null {
  const storage = instance.instance().storage() ?? []
  for (const entry of storage) {
    const key = entry.key()
    if (
      key.switch().name === 'scvSymbol' &&
      key.sym().toString() === 'Config'
    ) {
      return BigInt(PoolConfig.fromScVal(entry.val()).backstopRate)
    }
  }
  return null
}

interface ReserveKeys {
  config: string
  data: string
  instance: string
}

export function blendHistoryDecoder(version: Version): StellarHistoryDecoder {
  const keyCache = new Map<string, ReserveKeys>()
  const reserveKeys = (poolId: string, assetId: string): ReserveKeys => {
    const cacheKey = `${poolId}:${assetId}`
    let keys = keyCache.get(cacheKey)
    if (!keys) {
      keys = {
        config: ledgerKeyHash(ReserveConfig.ledgerKey(poolId, assetId)),
        data: ledgerKeyHash(ReserveData.ledgerKey(poolId, assetId)),
        instance: ledgerKeyHash(contractInstanceKey(poolId)),
      }
      keyCache.set(cacheKey, keys)
    }
    return keys
  }

  /** The reserve as the SDK would load it at the end of `bucket`, or null. */
  const reserveAt = (
    poolId: string,
    assetId: string,
    bucket: StellarHistoryBucket
  ) => {
    const keys = reserveKeys(poolId, assetId)
    const config = bucket.state.get(keys.config)
    const data = bucket.state.get(keys.data)
    const instance = bucket.state.get(keys.instance)
    // Before the reserve was added (or the pool deployed): no point, not an error.
    if (!config || !data || !instance) return null

    const takeRate = backstopTakeRate(instance.val)
    if (takeRate == null) return null

    // Parsed fresh for every bucket: `accrue` mutates the reserve data.
    const reserveData = ReserveData.fromScVal(data.val)
    const reserve =
      version === Version.V2
        ? new ReserveV2(
            poolId,
            assetId,
            ReserveConfigV2.fromScVal(config.val),
            reserveData,
            undefined,
            undefined,
            0,
            0,
            0,
            0,
            data.ledgerSequence
          )
        : new ReserveV1(
            poolId,
            assetId,
            ReserveConfig.fromScVal(config.val),
            reserveData,
            undefined,
            undefined,
            0,
            0,
            0,
            0,
            data.ledgerSequence
          )
    reserve.accrue(takeRate, Math.floor(bucket.end.getTime() / 1000))
    return reserve
  }

  return {
    stateSince: BLEND_STATE_SINCE,

    contractId: (target) => metaString(target, 'poolId'),

    ledgerKeys(poolId, targets) {
      const assets = new Set(
        targets
          .map((t) => metaString(t, 'assetId'))
          .filter((a): a is string => a !== null)
      )
      return [
        contractInstanceKey(poolId),
        ...[...assets].flatMap((assetId) => [
          ReserveConfig.ledgerKey(poolId, assetId),
          ReserveData.ledgerKey(poolId, assetId),
        ]),
      ]
    },

    decode({ contractId, target, bucket }): HistoryDataPoint[] {
      const assetId = metaString(target, 'assetId')
      if (!assetId) return []
      const reserve = reserveAt(contractId, assetId, bucket)
      if (!reserve) return []

      const utilizationRate = reserve.getUtilizationFloat()
      const supplyAssets = reserve.totalSupplyFloat()
      const timestamp = bucket.start

      if (target.kind === 'supply') {
        // Same split as apy-spot.ts: gross = borrowApr × utilization, net =
        // supplyApr (after the backstop's cut), fees = the cut.
        const base = aprToApyDaily(reserve.borrowApr * utilizationRate)
        const net = aprToApyDaily(reserve.supplyApr)
        return [
          {
            timestamp,
            productId: target.productId,
            kind: 'supply',
            apy: {
              base,
              rewards: 0,
              fees: Math.max(0, base - net),
              net,
              rewardItems: [],
            },
            market: {
              supplyAssets,
              supplyAssetsUsd: null,
              utilizationRate,
              assetPriceUsd: null,
            } satisfies SupplyMarketState,
          },
        ]
      }

      const borrowApy = aprToApyDaily(reserve.borrowApr)
      return [
        {
          timestamp,
          productId: target.productId,
          kind: 'borrow',
          apy: {
            base: borrowApy,
            rewards: 0,
            fees: 0,
            net: borrowApy,
            rewardItems: [],
          },
          market: {
            supplyAssets,
            supplyAssetsUsd: null,
            borrowAssets: reserve.totalLiabilitiesFloat(),
            borrowAssetsUsd: null,
            utilizationRate,
            assetPriceUsd: null,
            collateralAssetsUsd: null,
            priceCollateralInLoanAsset: null,
          } satisfies BorrowMarketState,
        },
      ]
    },
  }
}

/**
 * The products to rebuild: the caller's `targets` when it names them (the
 * reconcile job, the Stellar history CLI), else this version's whole Stellar
 * catalogue — the backfill — the way every other adapter enumerates its own.
 *
 * Either way the pool, asset and storage version come from the meta this
 * adapter wrote at `getProducts` time. The reconcile job hands the same Blend
 * targets to v1 and v2, so each keeps only its own version.
 */
async function historyTargets(
  params: HistoryParams,
  version: string
): Promise<HistoryTarget[]> {
  const requested = requestedProducts(params)
  if (requested?.byId.size) {
    return [...requested.byId.values()].filter(
      (t) => t.meta.version === version
    )
  }

  const [{ and, eq, inArray }, { db }, { products }] = await Promise.all([
    import('drizzle-orm'),
    import('@/lib/db/postgres'),
    import('@/lib/db/schema'),
  ])
  const where = [
    eq(products.provider, BLEND_PROVIDER),
    eq(products.version, version),
  ]
  if (requested?.ids.size) where.push(inArray(products.id, [...requested.ids]))

  const rows = await db
    .select({
      id: products.id,
      chainId: products.chainId,
      kind: products.kind,
      meta: products.meta,
    })
    .from(products)
    .where(and(...where))

  return rows.map((row) => ({
    productId: row.id,
    chainId: row.chainId,
    kind: row.kind as 'supply' | 'borrow',
    meta: (row.meta ?? {}) as Record<string, unknown>,
  }))
}

export async function getBlendApyHistory(
  params: HistoryParams,
  { deployment }: { deployment: BlendDeployment }
): Promise<HistoryResult> {
  const client = getBigQueryClient()
  if (!client) {
    throw new Error(
      '[history:blend] BigQuery client unavailable; set GCP_PROJECT and GCP_SERVICE_ACCOUNT_BASE64'
    )
  }

  const targets = await historyTargets(params, deployment.label)
  if (targets.length === 0) return { points: [], failures: [] }

  return fetchStellarHubbleHistory({
    client,
    targets,
    startTimestamp: params.startTimestamp,
    endTimestamp: params.endTimestamp,
    interval: params.interval,
    decoder: blendHistoryDecoder(deployment.sdk),
    onProgress: params.onProgress,
  })
}
