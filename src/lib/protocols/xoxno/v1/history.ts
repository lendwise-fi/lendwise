import { z } from 'zod'

import { processBatches } from '@/lib/protocols/core/toolkit/batch'
import type {
  HistoryDataPoint,
  HistoryParams,
  HistoryResult,
  HistoryTarget,
} from '@/lib/protocols/core/types'

import { type XoxnoClient, xoxnoClient } from './client'
import { XOXNO_CHAIN_ID } from './config'
import { createXoxnoYieldReads } from './products'
import { xoxnoProductId } from './utils'

const historyMeta = z.object({
  network: z.enum(['mainnet', 'testnet']),
  controller: z.string(),
  hubId: z.number().int().positive().safe(),
  asset: z.string().regex(/^C[A-Z2-7]{55}$/),
  historySpokeId: z.number().int().positive().safe(),
})

export function createXoxnoHistory(client: XoxnoClient = xoxnoClient) {
  return async (params: HistoryParams): Promise<HistoryResult> => {
    const failures: HistoryResult['failures'] = []
    if (params.chainIds && !params.chainIds.includes(XOXNO_CHAIN_ID))
      return { points: [], failures }
    if (
      !Number.isFinite(params.startTimestamp) ||
      !Number.isFinite(params.endTimestamp) ||
      params.startTimestamp > params.endTimestamp
    )
      throw new Error('Invalid XOXNO history range')
    let targets: HistoryTarget[]
    if (params.targets) targets = params.targets
    else {
      const products = await createXoxnoYieldReads(client).getProducts()
      const wanted = params.productIds ? new Set(params.productIds) : null
      targets = products
        .filter((p) => !wanted || wanted.has(p._id))
        .map((p) => ({
          productId: p._id,
          kind: p.kind,
          chainId: XOXNO_CHAIN_ID,
          meta: { ...p.protocol.meta },
        }))
      if (wanted)
        for (const id of wanted)
          if (!targets.some((p) => p.productId === id)) {
            failures.push({
              productId: id,
              reason: 'Product not discoverable; supply its stored metadata',
            })
          }
    }
    const groups = new Map<
      string,
      { meta: z.infer<typeof historyMeta>; targets: HistoryTarget[] }
    >()
    for (const target of targets) {
      try {
        const meta = historyMeta.parse(target.meta)
        if (
          target.chainId !== XOXNO_CHAIN_ID ||
          meta.network !== client.deployment.network ||
          meta.controller !== client.deployment.controller ||
          target.productId !== xoxnoProductId({ ...meta, kind: target.kind })
        ) {
          throw new Error(
            'History target deployment or product identity mismatch'
          )
        }
        const key = `${meta.hubId}:${meta.asset}`
        const group = groups.get(key) ?? { meta, targets: [] }
        if (!group.targets.some((x) => x.productId === target.productId))
          group.targets.push(target)
        groups.set(key, group)
      } catch (error) {
        failures.push({ productId: target.productId, reason: String(error) })
      }
    }
    const date = (seconds: number) =>
      new Date(seconds * 1_000).toISOString().slice(0, 10)
    const query = new URLSearchParams({
      from: date(params.startTimestamp),
      // Historical date-only `to` ends at midnight; widen, then clip exact timestamps below.
      to: date((Math.floor(params.endTimestamp / 86_400) + 1) * 86_400),
      bin: params.interval === 'HOUR' ? '1h' : '1d',
    })
    const batches = await processBatches(
      [...groups.values()],
      async ({ meta, targets: selected }) => {
        try {
          const graph = await client.graph(
            meta.historySpokeId,
            meta.hubId,
            meta.asset,
            query
          )
          const points: HistoryDataPoint[] = []
          for (const target of selected) {
            let count = 0
            for (const point of graph.points) {
              if (point.hubId !== meta.hubId || point.token !== meta.asset) {
                throw new Error('XOXNO graph market identity mismatch')
              }
              const timestamp = new Date(point.timestamp)
              const seconds = timestamp.getTime() / 1_000
              if (
                seconds < params.startTimestamp ||
                seconds > params.endTimestamp
              )
                continue
              const net =
                target.kind === 'supply' ? point.supplyApy : point.borrowApy
              if (net === null) continue
              const price =
                point.usdPrice !== null && point.usdPrice > 0
                  ? point.usdPrice
                  : null
              const native = (value: number | null) =>
                price === null || value === null ? null : value / price
              const shared = {
                supplyAssets: native(point.totalDepositsUsd),
                supplyAssetsUsd: price === null ? null : point.totalDepositsUsd,
                utilizationRate: point.utilization,
                assetPriceUsd: price,
                availableLiquidity: native(point.availableLiquidityUsd),
                availableLiquidityUsd:
                  price === null ? null : point.availableLiquidityUsd,
              }
              points.push({
                timestamp,
                productId: target.productId,
                kind: target.kind,
                // A bin averages independently compounded rates; its exact gross/fee split is unrecoverable.
                apy: {
                  base: target.kind === 'supply' ? null : net,
                  fees: target.kind === 'supply' ? null : 0,
                  rewards: 0,
                  net,
                  rewardItems: [],
                },
                market:
                  target.kind === 'supply'
                    ? shared
                    : {
                        ...shared,
                        borrowAssets: native(point.totalBorrowsUsd),
                        borrowAssetsUsd:
                          price === null ? null : point.totalBorrowsUsd,
                        collateralAssetsUsd: null,
                        priceCollateralInLoanAsset: null,
                      },
              })
              count++
            }
            if (count === 0)
              failures.push({
                productId: target.productId,
                reason: 'No valid history points in requested range',
              })
          }
          params.onProgress?.(
            `XOXNO hub ${meta.hubId}: ${points.length} points`
          )
          return points
        } catch (error) {
          for (const target of selected)
            failures.push({
              productId: target.productId,
              reason: String(error),
            })
          return []
        }
      },
      4
    )
    return { points: batches.flat(), failures }
  }
}

export const fetchXoxnoApyHistory = createXoxnoHistory()
