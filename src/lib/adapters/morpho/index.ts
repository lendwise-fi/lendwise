import { ProtocolAdapter } from '../types'
import { gqlAdapter } from './gql'

// Placeholder for a future subgraph adapter
// import { subgraphAdapter } from './subgraph'

export const MorphoAdapter: ProtocolAdapter = {
  protocol: 'morpho',
  ...gqlAdapter,
  // stats: subgraphAdapter, // Can be added later
}
