'use server'

import { cache } from 'react'

import { unstable_cache } from 'next/cache'

import { getProtocolAdapter, getProtocolIds } from '@/config/protocols'
import { serializeBigInt } from '@/lib/utils'
import { LendMarket } from '@/types'

async function fetchLendingMarkets(): Promise<LendMarket[]> {
  // Get all protocol IDs from registry
  const protocolIds = getProtocolIds()
  const allLendingMarkets: LendMarket[] = []

  try {
    // Dynamically load all protocol adapters and fetch markets
    const results = await Promise.allSettled(
      protocolIds.map(async (protocolId) => {
        const adapterLoader = getProtocolAdapter(protocolId)
        if (!adapterLoader) {
          throw new Error(`No adapter found for ${protocolId}`)
        }
        const protocolAdapter = await adapterLoader()
        return protocolAdapter.getLendingMarkets()
      })
    )

    results.forEach((result, index) => {
      const protocolId = protocolIds[index]

      if (result.status === 'fulfilled') {
        allLendingMarkets.push(...result.value)
      } else {
        console.error(`Adapter ${protocolId} failed:`, result.reason)
      }
    })

    // Serialize BigInt values to strings for JSON compatibility
    return serializeBigInt(allLendingMarkets.sort((a, b) => b.apy - a.apy))
  } catch (err) {
    console.error('Unexpected error in loadLendingMarkets:', err)
    return []
  }
}

// Next.js cache: persists across navigations (60 seconds)
const getCachedLendingMarkets = unstable_cache(
  fetchLendingMarkets,
  ['lending-markets'],
  {
    revalidate: 60, // Revalidate every 60 seconds
    tags: ['lending-markets'],
  }
)

// React cache: deduplicates requests within the same render tree
export const loadLendingMarkets = cache(getCachedLendingMarkets)
