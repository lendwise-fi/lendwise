import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import {
  ensureApyMergeIndex,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_SPOT,
  getDb,
} from '@/lib/db/mongodb'
import { ApyDocument } from '@/lib/db/types'

/**
 * APY collection endpoint.
 *
 * Triggered by QStash or Vercel cron.
 */
export const POST = verifySignatureAppRouter(async (_req: NextRequest) => {
  try {
    const db = await getDb()
    const spotCollection = db.collection<ApyDocument>(MONGODB_COLLECTION_SPOT)

    // Determine the hour to aggregate. If triggered at 09:10, target is 09:00.
    const now = new Date()
    const targetTimestamp = new Date(now)
    targetTimestamp.setMinutes(0, 0, 0)

    // The start of the window we are aggregating (e.g. 08:00:00)
    const periodStart = new Date(targetTimestamp)
    periodStart.setHours(periodStart.getHours() - 1)

    // The end of the window we are aggregating (e.g. 08:59:59.999)
    const periodEnd = new Date(targetTimestamp)
    periodEnd.setMilliseconds(-1)

    const hourlyCollection = db.collection(MONGODB_COLLECTION_HOURLY)
    await ensureApyMergeIndex(hourlyCollection as Parameters<typeof ensureApyMergeIndex>[0])

    const pipeline = [
      {
        $match: {
          timestamp: {
            $gte: periodStart,
            $lte: periodEnd,
          },
        },
      },
      {
        $group: {
          _id: {
            kind: '$kind',
            protocol: '$metadata.protocol',
            chainId: '$metadata.chain.id',
            chainName: '$metadata.chain.name',
            loanAssetSymbol: {
              $ifNull: [
                '$metadata.vault.loan_asset.symbol',
                '$metadata.market.loan_asset.symbol',
              ],
            },
            loanAssetName: {
              $ifNull: [
                '$metadata.vault.loan_asset.name',
                '$metadata.market.loan_asset.name',
              ],
            },
            loanAssetAddress: {
              $ifNull: [
                '$metadata.vault.loan_asset.address',
                '$metadata.market.loan_asset.address',
              ],
            },
          },
          vault: { $first: '$metadata.vault' },
          market: { $first: '$metadata.market' },
          supplyApy: { $avg: '$supplyApy' },
          borrowApy: { $avg: '$borrowApy' },
          supplyAssets: { $avg: '$supplyAssets' },
          supplyAssetsUsd: { $avg: '$supplyAssetsUsd' },
          borrowAssets: { $avg: '$borrowAssets' },
          borrowAssetsUsd: { $avg: '$borrowAssetsUsd' },
          collateralAssets: { $avg: '$collateralAssets' },
          collateralAssetsUsd: { $avg: '$collateralAssetsUsd' },
        },
      },
      {
        $project: {
          _id: 0,
          kind: '$_id.kind',
          timestamp: { $literal: targetTimestamp },
          loanAssetSymbol: '$_id.loanAssetSymbol',
          metadata: {
            protocol: '$_id.protocol',
            chain: {
              id: '$_id.chainId',
              name: '$_id.chainName',
            },
            vault: '$vault',
            market: '$market',
          },
          supplyApy: 1,
          borrowApy: 1,
          supplyAssets: 1,
          supplyAssetsUsd: 1,
          borrowAssets: 1,
          borrowAssetsUsd: 1,
          collateralAssets: 1,
          collateralAssetsUsd: 1,
        },
      },
      {
        $merge: {
          into: MONGODB_COLLECTION_HOURLY,
          on: [
            'kind',
            'timestamp',
            'metadata.protocol.name',
            'metadata.chain.name',
            'loanAssetSymbol',
          ],
          whenMatched: 'replace',
          whenNotMatched: 'insert',
        },
      },
    ]

    await spotCollection.aggregate(pipeline).toArray() // .toArray() triggers execution

    return NextResponse.json(
      { success: true, message: 'Hourly aggregation complete' },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron:apy-hourly] Aggregation failed:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
})
