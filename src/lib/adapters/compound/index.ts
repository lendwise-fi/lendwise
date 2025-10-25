import { ProtocolAdapter } from '../types'
import { gqlAdapter } from './gql'

// Placeholder for a future subgraph adapter
// import { subgraphAdapter } from './subgraph'

export const CompoundAdapter: ProtocolAdapter = {
  protocol: 'compound',
  ...gqlAdapter,
  // stats: subgraphAdapter, // Can be added later
}
