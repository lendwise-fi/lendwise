'use client'

import { useState, useEffect } from 'react'
import { AaveAdapter } from '@/lib/adapters/aave'
import { CompoundAdapter } from '@/lib/adapters/compound'
import { MorphoAdapter } from '@/lib/adapters/morpho'
import { LendingPosition } from '@/types/lending'

export function usePositions(address: `0x${string}`) {
  const [positions, setPositions] = useState<LendingPosition[] | null>(null)

  useEffect(() => {
    if (!address) return

    let cancelled = false

    async function fetchPositions() {
      const [aave, compound, morpho] = await Promise.allSettled([
        AaveAdapter.getUserPositions(address),
        CompoundAdapter.getUserPositions(address),
        MorphoAdapter.getUserPositions(address),
      ])

      if (!cancelled) {
        setPositions([
          ...(aave.status === 'fulfilled' ? aave.value : []),
          ...(compound.status === 'fulfilled' ? compound.value : []),
          ...(morpho.status === 'fulfilled' ? morpho.value : []),
        ])
      }
    }

    fetchPositions()
    return () => {
      cancelled = true
    }
  }, [address])

  return positions
}
