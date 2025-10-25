import { ProtocolAdapter } from '../types'
import { gqlAdapter } from './gql'
import { subgraphAdapter } from './subgraph'

export const AaveAdapter: ProtocolAdapter = {
  protocol: 'aave',
  ...gqlAdapter,
  stats: subgraphAdapter,
}
