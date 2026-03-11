import { GraphQLScalarType, Kind } from 'graphql'
import { Filter } from 'mongodb'

import { ALL_CHAINS } from '@/config/chains'
import { getProtocolIds } from '@/config/protocols'
import type { ApyDocument } from '@/lib/db/types'
import {
  MONGODB_COLLECTION_DAILY,
  MONGODB_COLLECTION_HOURLY,
  MONGODB_COLLECTION_MONTHLY,
  MONGODB_COLLECTION_SPOT,
  MONGODB_COLLECTION_WEEKLY,
  MONGODB_COLLECTION_YEARLY,
  getDb,
} from '@/lib/db/mongodb'

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description:
    'A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar.',
  serialize(value) {
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (typeof value === 'string') {
      return value
    }
    throw Error(
      'GraphQL DateTime Scalar serializer expected a `Date` object or an ISO string'
    )
  },
  parseValue(value) {
    if (typeof value === 'string') {
      return new Date(value)
    }
    throw new Error('GraphQL DateTime Scalar parser expected a `string`')
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value)
    }
    return null
  },
})

// One collection per timeframe: SPOT = time-series, HOURLY/DAILY/etc = classic (aggregated).
const TIMEFRAME_TO_COLLECTION: Record<string, string> = {
  SPOT: MONGODB_COLLECTION_SPOT,
  HOURLY: MONGODB_COLLECTION_HOURLY,
  DAILY: MONGODB_COLLECTION_DAILY,
  WEEKLY: MONGODB_COLLECTION_WEEKLY,
  MONTHLY: MONGODB_COLLECTION_MONTHLY,
  YEARLY: MONGODB_COLLECTION_YEARLY,
}

type ApyArgs = {
  timeframe: string
  protocol?: string
  market?: string
  chain?: string
  range?: string
  from?: string
  to?: string
}

async function resolveApy(kind: 'lend' | 'borrow', args: ApyArgs) {
  const { timeframe, protocol, market, chain, range, from, to } = args

      // 1. Validate Protocol (if provided)
      if (protocol) {
        const validProtocols = getProtocolIds() as string[]
        if (!validProtocols.includes(protocol)) {
          throw new Error(
            `Invalid protocol: ${protocol}. Supported protocols: ${validProtocols.join(
              ', '
            )}`
          )
        }
      }

      // 2. Validate Chain (if provided)
      if (chain) {
        const validChainSlugs = ALL_CHAINS.map((c) => c.name.toLowerCase())
        if (!validChainSlugs.includes(chain.toLowerCase())) {
          throw new Error(
            `Invalid chain: ${chain}. Supported chains: ${validChainSlugs.join(
              ', '
            )}`
          )
        }
      }

  const collectionName = TIMEFRAME_TO_COLLECTION[timeframe]
  if (!collectionName) {
    throw new Error(`Invalid timeframe: ${timeframe}`)
  }

  const db = await getDb()
  const collection = db.collection<ApyDocument>(collectionName)

  const query: Filter<ApyDocument> = {}

  if (protocol) query['metadata.protocol.name'] = protocol
  if (chain) query['metadata.chain.name'] = chain

  query.kind = kind

  if (market) {
    query.$or = [
      { 'metadata.vault.loan_asset.symbol': market },
      { 'metadata.market.loan_asset.symbol': market },
    ]
  }

  // Time range
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
      throw new Error(
        `Invalid range: ${effectiveRange}. Allowed values: ${Object.keys(
          rangeMap
        ).join(', ')}.`
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

  return data
}

export const resolvers = {
  DateTime,
  Query: {
    lendApy: async (_: unknown, args: ApyArgs) => resolveApy('lend', args),
    borrowApy: async (_: unknown, args: ApyArgs) => resolveApy('borrow', args),
  },
}
