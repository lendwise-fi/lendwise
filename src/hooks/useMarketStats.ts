import { AaveAdapter } from '@/lib/protocols/aave'
import { CompoundAdapter } from '@/lib/protocols/compound'
import { MorphoAdapter } from '@/lib/protocols/morpho'
import { MarketStats } from '@/types'

export async function getMarketStats(): Promise<MarketStats[]> {
  // Fetch stats from all protocols using their stats data source
  const [aave, compound, morpho] = await Promise.allSettled([
    AaveAdapter.getMarketStats(),
    CompoundAdapter.getMarketStats(),
    MorphoAdapter.getMarketStats(),
  ])

  return [
    ...(aave.status === 'fulfilled' ? aave.value : []),
    ...(compound.status === 'fulfilled' ? compound.value : []),
    ...(morpho.status === 'fulfilled' ? morpho.value : []),
  ]
}
