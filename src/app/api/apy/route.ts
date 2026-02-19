import { NextRequest, NextResponse } from 'next/server'

import { Filter } from 'mongodb'

import { ALL_CHAINS } from '@/config/chains'
import { getProtocolIds } from '@/config/protocols'
import { getDb } from '@/lib/db/mongodb'

/**
 * API endpoint for querying APY history from MongoDB.
 *
 * Query parameters:
 * - protocol (optional): Protocol ID (e.g. 'aave_v3', 'morpho_v1', 'compound_v3')
 * - market   (optional): Market/asset symbol (e.g. 'USDC', 'WETH')
 * - range    (optional): Time range (allowed: 1h, 24h, 7d, 30d, 3m, 6m, 9m, 1y). Default: '24h'
 * - chain    (optional): Chain filter (e.g. 'ethereum', 'arbitrum')
 * - from     (optional): ISO start date
 * - to       (optional): ISO end date
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const protocol = searchParams.get('protocol')
  const market = searchParams.get('market')
  const chain = searchParams.get('chain')
  const range = searchParams.get('range')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // 1. Validate Protocol (if provided)
  if (protocol) {
    const validProtocols = getProtocolIds() as string[]
    if (!validProtocols.includes(protocol)) {
      return NextResponse.json(
        {
          error: `Invalid protocol: ${protocol}. Supported protocols: ${validProtocols.join(', ')}`,
        },
        { status: 400 }
      )
    }
  }

  // 2. Validate Chain (if provided)
  if (chain) {
    const validChainSlugs = ALL_CHAINS.map((c) => c.name.toLowerCase())
    if (!validChainSlugs.includes(chain.toLowerCase())) {
      return NextResponse.json(
        {
          error: `Invalid chain: ${chain}. Supported chains: ${validChainSlugs.join(', ')}`,
        },
        { status: 400 }
      )
    }
  }

  try {
    const db = await getDb()
    const collection = db.collection('spot')

    // Build query object
    const query: Filter<Record<string, unknown>> = {}

    if (protocol) query['metadata.protocol'] = protocol
    if (chain) query['metadata.chain.name'] = chain
    if (market) {
      query.$or = [
        { 'metadata.vault.symbol': market },
        { 'metadata.market.name': market },
      ]
    }

    // 4. Handle time range
    const timeFilter: { $gte?: Date; $lte?: Date } = {}
    const effectiveRange = range || (!from ? '24h' : null)

    if (from) {
      timeFilter.$gte = new Date(from)
    } else if (effectiveRange) {
      const rangeMap: Record<string, number> = {
        '1h': 1 / 24,
        '24h': 1,
        '7d': 7,
        '30d': 30,
        '3m': 90,
        '6m': 180,
        '9m': 270,
        '1y': 365,
      }

      const days = rangeMap[effectiveRange.toLowerCase()]

      if (days === undefined) {
        return NextResponse.json(
          {
            error: `Invalid range: ${effectiveRange}. Allowed values: ${Object.keys(rangeMap).join(', ')}.`,
          },
          { status: 400 }
        )
      }

      const start = new Date()
      start.setTime(start.getTime() - days * 24 * 60 * 60 * 1000)
      timeFilter.$gte = start
    }

    if (to) {
      timeFilter.$lte = new Date(to)
    }

    if (Object.keys(timeFilter).length > 0) {
      query.timestamp = timeFilter
    }

    const data = await collection.find(query).sort({ timestamp: 1 }).toArray()

    return NextResponse.json({
      data,
      count: data.length,
      query,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api:apy] Query error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
