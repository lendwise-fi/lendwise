import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import {
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_SPOT,
  getDb,
} from '@/lib/db/mongodb'
import { ApyTimeSeriesDocument } from '@/lib/db/types'

const MIN_SPOT_POINTS_PER_HOUR = 5

/**
 * APY collection endpoint.
 *
 * Triggered by QStash or Vercel cron.
 */
export const POST = verifySignatureAppRouter(async (_req: NextRequest) => {
  try {
    const db = await getDb()
    const spotCollection = db.collection<ApyTimeSeriesDocument>(
      MONGODB_COLLECTION_SPOT
    )

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

    const pointsCount = await spotCollection.countDocuments({
      timestamp: {
        $gte: periodStart,
        $lte: periodEnd,
      },
    })

    if (pointsCount < MIN_SPOT_POINTS_PER_HOUR) {
      console.warn(
        `[cron:apy-hourly] Skipping aggregation for ${targetTimestamp.toISOString()} — only ${pointsCount} spot points (< ${MIN_SPOT_POINTS_PER_HOUR})`
      )
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          reason: 'not enough spot datapoints for hourly aggregation',
          pointsCount,
        },
        { status: 200 }
      )
    }

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
            protocol: '$metadata.protocol',
            chainId: '$metadata.chain.id',
            chainName: '$metadata.chain.name',
            marketName: '$metadata.market.name',
            marketAddress: '$metadata.market.address',
            vaultSymbol: '$metadata.vault.symbol',
            vaultName: '$metadata.vault.name',
            vaultAddress: '$metadata.vault.address',
          },
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
          timestamp: { $literal: targetTimestamp },
          metadata: {
            protocol: '$_id.protocol',
            chain: {
              id: '$_id.chainId',
              name: '$_id.chainName',
            },
            market: {
              name: '$_id.marketName',
              address: '$_id.marketAddress',
            },
            vault: {
              symbol: '$_id.vaultSymbol',
              name: '$_id.vaultName',
              address: '$_id.vaultAddress',
            },
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
          // Merge based on the unique combination of timestamp and metadata identifiers
          on: [
            'timestamp',
            'metadata.protocol',
            'metadata.chain.name',
            'metadata.market.name',
            'metadata.vault.symbol',
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
