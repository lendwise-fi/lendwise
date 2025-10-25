import { AaveAdapter } from '@/lib/adapters/aave'
import { CompoundAdapter } from '@/lib/adapters/compound'
import { MorphoAdapter } from '@/lib/adapters/morpho'
import { MarketStats } from '@/types/lending'

export async function getMarketStats(): Promise<MarketStats[]> {
  const [aave, compound, morpho] = await Promise.allSettled([
    AaveAdapter.stats?.getMarketStats() ?? Promise.resolve([]),
    CompoundAdapter.stats?.getMarketStats() ?? Promise.resolve([]),
    MorphoAdapter.stats?.getMarketStats() ?? Promise.resolve([]),
  ])

  return [
    ...(aave.status === 'fulfilled' ? aave.value : []),
    ...(compound.status === 'fulfilled' ? compound.value : []),
    ...(morpho.status === 'fulfilled' ? morpho.value : []),
  ]
}
