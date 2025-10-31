import { arbitrumAdapter } from './arbitrum'
import { ethereumAdapter } from './ethereum'

const adapters: {
  [chainId: number]: typeof ethereumAdapter | typeof arbitrumAdapter
} = {
  1: ethereumAdapter,
  42161: arbitrumAdapter,
}

export function getMorphoSubgraphAdapter(chainId: number) {
  const adapter = adapters[chainId]
  if (!adapter) {
    throw new Error(`No Morpho subgraph adapter found for chainId: ${chainId}`)
  }
  return adapter
}
