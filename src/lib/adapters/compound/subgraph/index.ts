import { ethereumAdapter } from './ethereum'
import { arbitrumAdapter } from './arbitrum'

const adapters: { [chainId: number]: typeof ethereumAdapter | typeof arbitrumAdapter } = {
  1: ethereumAdapter,
  42161: arbitrumAdapter,
}

export function getCompoundSubgraphAdapter(chainId: number) {
  const adapter = adapters[chainId]
  if (!adapter) {
    throw new Error(`No Compound subgraph adapter found for chainId: ${chainId}`)
  }
  return adapter
}
