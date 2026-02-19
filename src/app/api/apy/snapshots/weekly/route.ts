import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import { getDb } from '@/lib/db/mongodb'
import { ApyTimeSeriesDocument } from '@/lib/db/types'

/**
 * Weekly APY aggregation endpoint.
 *
 * Triggered by QStash or Vercel cron once a week (e.g. Monday at 00:30).
 * Aggregates all 'daily' data points from the previous Monday through Sunday into a single 'weekly' snapshot.
 */
export const POST = verifySignatureAppRouter(async (_req: NextRequest) => {
  try {
    const db = await getDb('apy')
    const sourceCollection = db.collection<ApyTimeSeriesDocument>('daily')

    const now = new Date()

    // Assuming cron runs early Monday morning. We want targetTimestamp to be the previous Monday at 00:00:00
    // getDay() gives 0 for Sunday, 1 for Monday... We find how many days to subtract to get to the *previous* Monday
    const currentDayOfWeek = now.getDay()
    // If it's Monday(1), we go back 7 days. If Tuesday(2), we go back 8 days to hit last week's Monday.
    const daysToLastMonday =
      currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1 + 7

    const targetTimestamp = new Date(now)
    targetTimestamp.setDate(targetTimestamp.getDate() - daysToLastMonday)
    targetTimestamp.setHours(0, 0, 0, 0)

    const periodStart = new Date(targetTimestamp)

    const periodEnd = new Date(targetTimestamp)
    periodEnd.setDate(periodEnd.getDate() + 6) // End of Sunday
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
          into: 'weekly',
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
      { success: true, message: 'Weekly aggregation complete' },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron:apy-weekly] Aggregation failed:', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
})
