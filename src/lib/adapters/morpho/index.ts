import { GraphqlProtocolAdapter } from '../types'
import { gqlAdapter } from './gql'

// Placeholder for a future subgraph adapter
// import { subgraphAdapter } from './subgraph'

export const MorphoAdapter: GraphqlProtocolAdapter = {
  protocol: 'morpho',
  ...gqlAdapter,
  // stats: subgraphAdapter, // Can be added later
}
