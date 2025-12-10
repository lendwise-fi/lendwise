'use server'

import { unstable_cache } from 'next/cache'

import { getProtocolAdapter, getProtocolIds } from '@/config/protocols'
import { LendMarket } from '@/types'

async function fetchLendingMarkets(): Promise<LendMarket[]> {
  const protocolIds = getProtocolIds()

  const results = await Promise.allSettled(
    protocolIds.map(async (protocolId) => {
      const adapterLoader = getProtocolAdapter(protocolId)
      if (!adapterLoader) throw new Error(`No adapter found for ${protocolId}`)

      const protocolAdapter = await adapterLoader()
      return protocolAdapter.getLendingMarkets()
    })
  )

  const allLendingMarkets: LendMarket[] = []

  results.forEach((result, index) => {
    const protocolId = protocolIds[index]
    if (result.status === 'fulfilled') {
      allLendingMarkets.push(...result.value)
    } else {
      console.error(`Adapter ${protocolId} failed:`, result.reason)
    }
  })

  return allLendingMarkets.sort((a, b) => b.apy - a.apy)
}

export const loadLendingMarkets = unstable_cache(
  fetchLendingMarkets,
  ['lending-markets'],
  {
    revalidate: 60,
    tags: ['lending-markets'],
  }
)
