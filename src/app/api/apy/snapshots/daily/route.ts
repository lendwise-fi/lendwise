import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  getDb,
} from '@/lib/db/mongodb'
import { ApyTimeSeriesDocument } from '@/lib/db/types'

/**
 * Daily APY aggregation endpoint.
 *
 * Triggered by QStash or Vercel cron once a day (e.g. at 00:15).
 * Aggregates all 'hourly' data points from the previous day into a single 'daily' snapshot.
 */
export const POST = verifySignatureAppRouter(async (_req: NextRequest) => {
  try {
    const db = await getDb()
    const sourceCollection = db.collection<ApyTimeSeriesDocument>(
      MONGODB_COLLECTION_HOURLY
    )

    const now = new Date()

    // Determine the target timestamp: Midnight of the previous day
    const targetTimestamp = new Date(now)
    targetTimestamp.setDate(targetTimestamp.getDate() - 1)
    targetTimestamp.setHours(0, 0, 0, 0)

    // The start of the window: 00:00:00 of the previous day
    const periodStart = new Date(targetTimestamp)

    // The end of the window: 23:59:59.999 of the previous day
    const periodEnd = new Date(targetTimestamp)
    periodEnd.setHours(23, 59, 59, 999)

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
          into: MONGODB_COLLECTION_DAILY,
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

    await sourceCollection.aggregate(pipeline).toArray()

    return NextResponse.json(
      { success: true, message: 'Daily aggregation complete' },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron:apy-daily] Aggregation failed:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
})
