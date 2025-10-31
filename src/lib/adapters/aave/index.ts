import { GraphqlProtocolAdapter } from '../types'
import { gqlAdapter } from './gql'

// import { subgraphAdapter } from './subgraph'

export const AaveAdapter: GraphqlProtocolAdapter = {
  protocol: 'aave',
  ...gqlAdapter,
  // stats: subgraphAdapter,
}
