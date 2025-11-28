'use server'

import { cache } from 'react'

import { Address } from 'viem'

import { getProtocolAdapter, getProtocolIds } from '@/config/protocols'
import { LendPosition, ProtocolName } from '@/types'

// Generate return type dynamically from supported protocols
type ProtocolPositions = Record<ProtocolName, LendPosition[]>

export const loadUserLendPositions = cache(async function loadUserLendPositions(
  addresses: Address[]
): Promise<ProtocolPositions> {
  // Get all protocol IDs from registry
  const protocolIds = getProtocolIds()

  // Create empty positions object for all supported protocols
  const emptyPositions = protocolIds.reduce((acc, protocolId) => {
    acc[protocolId] = []
    return acc
  }, {} as ProtocolPositions)

  // Return empty positions if no addresses provided
  if (!addresses || addresses.length === 0) {
    return emptyPositions
  }

  try {
    // Dynamically load all protocol adapters and fetch positions
    const results = await Promise.allSettled(
      protocolIds.map(async (protocolId) => {
        const adapterLoader = getProtocolAdapter(protocolId)
        if (!adapterLoader) {
          throw new Error(`No adapter found for ${protocolId}`)
        }
        const protocolAdapter = await adapterLoader()
        const positions = await protocolAdapter.getUserLendPositions({
          addresses,
        })
        return { protocolId, positions }
      })
    )

    // Build the result object from all protocol results
    const positions: ProtocolPositions = { ...emptyPositions }

    results.forEach((result, index) => {
      const protocolId = protocolIds[index]

      if (result.status === 'fulfilled') {
        positions[result.value.protocolId] = result.value.positions
      } else {
        console.error(`${protocolId} adapter failed:`, result.reason)
        positions[protocolId] = []
      }
    })

    return positions
  } catch (err) {
    console.error('Unexpected error in loadUserPositions:', err)
    return emptyPositions
  }
})
