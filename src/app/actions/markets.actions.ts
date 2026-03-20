'use server'

import { unstable_cache } from 'next/cache'

import { getProtocolAdapter, getProtocolIds } from '@/config/protocols'
import { SupplyMarket } from '@/types'

async function fetchSupplyingMarkets(): Promise<SupplyMarket[]> {
  const protocolIds = getProtocolIds()

  const results = await Promise.allSettled(
    protocolIds.map(async (protocolId) => {
      const adapterLoader = getProtocolAdapter(protocolId)
      if (!adapterLoader) throw new Error(`No adapter found for ${protocolId}`)

      const protocolAdapter = await adapterLoader()
      return protocolAdapter.getSupplyingMarkets()
    })
  )

  const allSupplyingMarkets: SupplyMarket[] = []

  results.forEach((result, index) => {
    const protocolId = protocolIds[index]
    if (result.status === 'fulfilled') {
      allSupplyingMarkets.push(...result.value)
    } else {
      console.error(`Adapter ${protocolId} failed:`, result.reason)
    }
  })

  return allSupplyingMarkets.sort((a, b) => b.apy - a.apy)
}

export const loadSupplyingMarkets = unstable_cache(
  fetchSupplyingMarkets,
  ['supplying-markets'],
  {
    revalidate: 60,
    tags: ['supplying-markets'],
  }
)
