import { base, mainnet, polygon } from 'viem/chains'

import type { ProtocolConfig } from '@/config/protocols'

import { GraphqlProtocolAdapter } from '../types'
import { gqlAdapter } from './gql'

// Placeholder for a future subgraph adapter
// import { subgraphAdapter } from './subgraph'

// ============================================================================
// Compound V3 (Comet) Configuration
// ============================================================================
export const COMPOUND_CONFIG: Record<number, ProtocolConfig> = {
  [mainnet.id]: {
    name: 'compound',
    displayName: 'Compound V3',
    chainId: mainnet.id,
    contracts: {
      comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
    },
    markets: [],
    blockExplorer: 'https://etherscan.io',
  },
  [polygon.id]: {
    name: 'compound',
    displayName: 'Compound V3',
    chainId: polygon.id,
    contracts: {
      comptroller: '0xF25212E676D1F7F89Cd72fFEe66158f541246445',
    },
    markets: [],
    blockExplorer: 'https://polygonscan.com',
  },
  [base.id]: {
    name: 'compound',
    displayName: 'Compound V3',
    chainId: base.id,
    contracts: {
      comptroller: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
    },
    markets: [],
    blockExplorer: 'https://basescan.org',
  },
}

// ============================================================================
// Compound Adapter
// ============================================================================
export const CompoundAdapter: GraphqlProtocolAdapter = {
  protocol: 'compound',
  ...gqlAdapter,
  // stats: subgraphAdapter, // Can be added later
}
