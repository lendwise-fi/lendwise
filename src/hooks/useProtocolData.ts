import { useState, useEffect } from 'react'
import { LendingPosition, MarketStats } from '@/types/lending'
import { AaveAdapter } from '@/lib/adapters/aave'
import { CompoundAdapter } from '@/lib/adapters/compound'
import { MorphoAdapter } from '@/lib/adapters/morpho'
import { getAaveSubgraphAdapter } from '@/lib/adapters/aave/subgraph'
import { getCompoundSubgraphAdapter } from '@/lib/adapters/compound/subgraph'
import { getMorphoSubgraphAdapter } from '@/lib/adapters/morpho/subgraph'

export function useProtocolData(address: `0x${string}` | undefined, chainId: number) {
  const [positions, setPositions] = useState<LendingPosition[]>([])
  const [stats, setStats] = useState<MarketStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) return

    let cancelled = false
    setLoading(true)

    async function fetchData() {
      // 1. Fetch all user positions (these are often cross-chain from the GQL API)
      const [aavePos, compoundPos, morphoPos] = await Promise.allSettled([
        AaveAdapter.getUserPositions(address!),
        CompoundAdapter.getUserPositions(address!),
        MorphoAdapter.getUserPositions(address!),
      ])

      // 2. Fetch market stats for the *selected* chain
      const aaveSubgraph = getAaveSubgraphAdapter(chainId)
      const compoundSubgraph = getCompoundSubgraphAdapter(chainId)
      const morphoSubgraph = getMorphoSubgraphAdapter(chainId)

      const [aaveStats, compoundStats, morphoStats] = await Promise.allSettled([
        aaveSubgraph.getMarketStats(),
        compoundSubgraph.getMarketStats(),
        morphoSubgraph.getMarketStats(),
      ])

      if (!cancelled) {
        const allPositions = [
          ...(aavePos.status === 'fulfilled' ? aavePos.value : []),
          ...(compoundPos.status === 'fulfilled' ? compoundPos.value : []),
          ...(morphoPos.status === 'fulfilled' ? morphoPos.value : []),
        ]
        setPositions(allPositions)

        const allStats = [
          ...(aaveStats.status === 'fulfilled' ? aaveStats.value : []),
          ...(compoundStats.status === 'fulfilled' ? compoundStats.value : []),
          ...(morphoStats.status === 'fulfilled' ? morphoStats.value : []),
        ]
        setStats(allStats)
        setLoading(false)
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [address, chainId])

  return { positions, stats, loading }
}
