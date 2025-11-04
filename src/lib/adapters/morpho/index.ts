import { arbitrum, base, mainnet, polygon } from 'viem/chains'

import type { ProtocolConfig } from '@/config/protocols'

import { GraphqlProtocolAdapter } from '../types'
import { gqlAdapter } from './gql'

// Placeholder for a future subgraph adapter
// import { subgraphAdapter } from './subgraph'

// ============================================================================
// Morpho Protocol Identifier
// ============================================================================
export const PROTOCOL_ID = 'morpho' as const

// ============================================================================
// Morpho Protocol Configuration
// ============================================================================
export const MORPHO_CONFIG: Record<number, ProtocolConfig> = {
  [mainnet.id]: {
    name: PROTOCOL_ID,
    displayName: 'Morpho',
    chainId: mainnet.id,
    contracts: {
      morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    },
    markets: [],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-mainnet',
    blockExplorer: 'https://etherscan.io',
  },
  [base.id]: {
    name: PROTOCOL_ID,
    displayName: 'Morpho',
    chainId: base.id,
    contracts: {
      morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    },
    markets: [],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-base',
    blockExplorer: 'https://basescan.org',
  },
  [arbitrum.id]: {
    name: PROTOCOL_ID,
    displayName: 'Morpho',
    chainId: arbitrum.id,
    contracts: {
      morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    },
    markets: [],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [polygon.id]: {
    name: PROTOCOL_ID,
    displayName: 'Morpho',
    chainId: polygon.id,
    contracts: {
      morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    },
    markets: [],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-polygon',
    blockExplorer: 'https://polygonscan.com',
  },
}

// ============================================================================
// Morpho Adapter
// ============================================================================
export const MorphoAdapter: GraphqlProtocolAdapter = {
  protocol: PROTOCOL_ID,
  ...gqlAdapter,
  // stats: subgraphAdapter, // Can be added later
}
