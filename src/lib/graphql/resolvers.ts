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

type ApyDocumentOrLegacy = ApyDocument | Record<string, unknown>

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

export const resolvers = {
  DateTime,
  Query: {
    apy: async (
      _: unknown,
      args: {
        timeframe: string
        protocol?: string
        market?: string
        chain?: string
        range?: string
        from?: string
        to?: string
        kind?: 'VAULT' | 'MARKET'
      }
    ) => {
      const { timeframe, protocol, market, chain, range, from, to, kind } =
        args

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
      const collection = db.collection<ApyDocumentOrLegacy>(collectionName)

      const query: Filter<ApyDocument> = {}

      if (protocol) query['metadata.protocol.name'] = protocol
      if (chain) query['metadata.chain.name'] = chain

      // SPOT (spot collection): filter by kind and/or market (loan_asset.symbol)
      if (timeframe === 'SPOT') {
        if (kind === 'VAULT') query.kind = 'vault'
        else if (kind === 'MARKET') query.kind = 'market'
        if (market) {
          query.$or = [
            { 'metadata.vault.loan_asset.symbol': market },
            { 'metadata.market.loan_asset.symbol': market },
          ]
        }
      } else {
        // Legacy collections (hourly, daily, etc.): old metadata shape
        if (market) {
          query.$or = [
            { 'metadata.vault.symbol': market },
            { 'metadata.market.loan_asset.symbol': market },
          ]
        }
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

      // Normalize for GraphQL: ensure metadata.vault / metadata.market and supplyApy.net
      return data.map((doc: Record<string, unknown>) => {
        const meta = doc.metadata as Record<string, unknown>
        if (doc.kind === 'vault') {
          return {
            ...doc,
            metadata: {
              ...meta,
              vault: meta.vault ?? null,
              market: null,
            },
            supplyApy: {
              ...(doc.supplyApy as object),
              net: (doc.supplyApy as { net?: number; total?: number })?.net ?? (doc.supplyApy as { total?: number })?.total ?? 0,
            },
          }
        }
        if (doc.kind === 'market') {
          return {
            ...doc,
            metadata: {
              ...meta,
              vault: null,
              market: meta.market ?? null,
            },
            supplyApy: {
              ...(doc.supplyApy as object),
              net: (doc.supplyApy as { net?: number; total?: number })?.net ?? (doc.supplyApy as { total?: number })?.total ?? 0,
            },
            borrowApy: doc.borrowApy
              ? {
                  ...(doc.borrowApy as object),
                  net: (doc.borrowApy as { net?: number; total?: number })?.net ?? (doc.borrowApy as { total?: number })?.total ?? 0,
                }
              : null,
          }
        }
        // Legacy doc (hourly/daily etc.): map old shape to new (vault with loan_asset, net from total)
        const vault = meta.vault as { symbol?: string; name?: string; address?: string; loan_asset?: unknown } | undefined
        const vaultNormalized =
          vault && !vault.loan_asset
            ? {
                loan_asset: {
                  symbol: vault.symbol ?? '',
                  name: vault.name ?? '',
                  address: vault.address ?? '',
                  price_in_dollars: 0,
                },
              }
            : vault ?? null
        const supplyApy = doc.supplyApy as { native?: number; rewards?: number; fees?: number; total?: number; net?: number }
        const borrowApy = doc.borrowApy as { native?: number; rewards?: number; fees?: number; total?: number; net?: number } | undefined
        return {
          ...doc,
          kind: null,
          metadata: { ...meta, vault: vaultNormalized, market: null },
          supplyApy: {
            ...supplyApy,
            net: supplyApy?.net ?? supplyApy?.total ?? 0,
          },
          borrowApy: borrowApy
            ? { ...borrowApy, net: borrowApy?.net ?? borrowApy?.total ?? 0 }
            : null,
        }
      })
    },
  },
}
