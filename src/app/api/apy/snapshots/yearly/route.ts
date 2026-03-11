import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import {
  MONGODB_COLLECTION_MONTHLY,
  MONGODB_COLLECTION_YEARLY,
  getDb,
} from '@/lib/db/mongodb'
import { ApyTimeSeriesDocument } from '@/lib/db/types'

/**
 * Yearly APY aggregation endpoint.
 *
 * Triggered by QStash or Vercel cron on January 1st (e.g. at 02:00).
 * Aggregates all 'monthly' data points from the preceding calendar year.
 */
export const POST = verifySignatureAppRouter(async (_req: NextRequest) => {
  try {
    const db = await getDb()
    const sourceCollection = db.collection<ApyTimeSeriesDocument>(
      MONGODB_COLLECTION_MONTHLY
    )

    const now = new Date()

    // Determine target timestamp: January 1st of the previous calendar year
    const previousYear = now.getFullYear() - 1

    const targetTimestamp = new Date(previousYear, 0, 1) // Jan 1st, 00:00:00
    targetTimestamp.setHours(0, 0, 0, 0)

    const periodStart = new Date(targetTimestamp)

    // End of previous year: Dec 31st
    const periodEnd = new Date(previousYear, 11, 31)
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
          into: MONGODB_COLLECTION_YEARLY,
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
      { success: true, message: 'Yearly aggregation complete' },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron:apy-yearly] Aggregation failed:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
})
