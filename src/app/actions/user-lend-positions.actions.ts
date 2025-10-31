'use server'

import { cache } from 'react'

import { Address } from 'viem'

import { SUPPORTED_PROTOCOLS } from '@/config/protocols'
import { LendPosition, ProtocolName } from '@/types'

// Generate return type dynamically from supported protocols
type ProtocolPositions = Record<ProtocolName, LendPosition[]>

export const loadUserLendPositions = cache(async function loadUserLendPositions(
  addresses: Address[]
): Promise<ProtocolPositions> {
  // Create empty positions object for all supported protocols
  const emptyPositions = SUPPORTED_PROTOCOLS.reduce((acc, { name }) => {
    acc[name] = []
    return acc
  }, {} as ProtocolPositions)

  // Return empty positions if no addresses provided
  if (!addresses || addresses.length === 0) {
    return emptyPositions
  }

  try {
    // Dynamically load all protocol adapters and fetch positions
    const results = await Promise.allSettled(
      SUPPORTED_PROTOCOLS.map(async ({ name, adapter }) => {
        const protocolAdapter = await adapter()
        const positions = await protocolAdapter.getUserLendPositions(addresses)
        return { name, positions }
      })
    )

    // Build the result object from all protocol results
    const positions: ProtocolPositions = { ...emptyPositions }

    results.forEach((result, index) => {
      const protocolName = SUPPORTED_PROTOCOLS[index].name

      if (result.status === 'fulfilled') {
        positions[result.value.name] = result.value.positions
      } else {
        console.error(`${protocolName} adapter failed:`, result.reason)
        positions[protocolName] = []
      }
    })

    return positions
  } catch (err) {
    console.error('Unexpected error in loadUserPositions:', err)
    return emptyPositions
  }
})
