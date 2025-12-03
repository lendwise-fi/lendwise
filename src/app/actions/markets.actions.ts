'use server'

import { cache } from 'react'

import { getProtocolAdapter, getProtocolIds } from '@/config/protocols'
import { LendMarket, ProtocolName } from '@/types'

// Generate return type dynamically from supported protocols
type ProtocolMarkets = Record<ProtocolName, LendMarket[]>

export const loadLendingMarkets = cache(
  async function loadLendingMarkets(): Promise<ProtocolMarkets> {
    // Get all protocol IDs from registry
    const protocolIds = getProtocolIds()

    // Create empty markets object for all supported protocols
    const emptyMarkets = protocolIds.reduce((acc, protocolId) => {
      acc[protocolId] = []
      return acc
    }, {} as ProtocolMarkets)

    try {
      // Dynamically load all protocol adapters and fetch positions
      const results = await Promise.allSettled(
        protocolIds.map(async (protocolId) => {
          const adapterLoader = getProtocolAdapter(protocolId)
          if (!adapterLoader) {
            throw new Error(`No adapter found for ${protocolId}`)
          }
          const protocolAdapter = await adapterLoader()
          const markets = await protocolAdapter.getLendingMarkets()
          return { protocolId, markets }
        })
      )

      // Build the result object from all protocol results
      const markets: ProtocolMarkets = { ...emptyMarkets }

      results.forEach((result, index) => {
        const protocolId = protocolIds[index]

        if (result.status === 'fulfilled') {
          markets[result.value.protocolId] = result.value.markets
        } else {
          console.error(`${protocolId} adapter failed:`, result.reason)
          markets[protocolId] = []
        }
      })

      return markets
    } catch (err) {
      console.error('Unexpected error in loadUserPositions:', err)
      return emptyMarkets
    }
  }
)
