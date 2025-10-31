import { arbitrum, base, mainnet, polygon } from 'viem/chains'

import { GraphqlProtocolAdapter } from '@/lib/adapters/types'
import { ProtocolConfig, ProtocolName } from '@/types'

// Protocol Registry Entry
export interface ProtocolRegistryEntry {
  name: ProtocolName
  adapter: () => Promise<GraphqlProtocolAdapter>
}

// AAVE V3 Protocol Configuration
export const AAVE_CONFIG: Record<number, ProtocolConfig> = {
  [mainnet.id]: {
    name: 'aave',
    displayName: 'Aave V3',
    chainId: mainnet.id,
    contracts: {
      pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      dataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
      oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
    },
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
    blockExplorer: 'https://etherscan.io',
  },
  [polygon.id]: {
    name: 'aave',
    displayName: 'Aave V3',
    chainId: polygon.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1',
    },
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
    blockExplorer: 'https://polygonscan.com',
  },
  [arbitrum.id]: {
    name: 'aave',
    displayName: 'Aave V3',
    chainId: arbitrum.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
}

// Compound V3 (Comet) Configuration
export const COMPOUND_CONFIG: Record<number, ProtocolConfig> = {
  [mainnet.id]: {
    name: 'compound',
    displayName: 'Compound V3',
    chainId: mainnet.id,
    contracts: {
      comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
    },
    blockExplorer: 'https://etherscan.io',
  },
  [polygon.id]: {
    name: 'compound',
    displayName: 'Compound V3',
    chainId: polygon.id,
    contracts: {
      comptroller: '0xF25212E676D1F7F89Cd72fFEe66158f541246445',
    },
    blockExplorer: 'https://polygonscan.com',
  },
  [base.id]: {
    name: 'compound',
    displayName: 'Compound V3',
    chainId: base.id,
    contracts: {
      comptroller: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
    },
    blockExplorer: 'https://basescan.org',
  },
}

// Morpho Protocol Configuration
export const MORPHO_CONFIG: Record<number, ProtocolConfig> = {
  [mainnet.id]: {
    name: 'morpho',
    displayName: 'Morpho',
    chainId: mainnet.id,
    contracts: {
      morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    },
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-mainnet',
    blockExplorer: 'https://etherscan.io',
  },
  [base.id]: {
    name: 'morpho',
    displayName: 'Morpho',
    chainId: base.id,
    contracts: {
      morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    },
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-base',
    blockExplorer: 'https://basescan.org',
  },
  [arbitrum.id]: {
    name: 'morpho',
    displayName: 'Morpho',
    chainId: arbitrum.id,
    contracts: {
      morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    },
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [polygon.id]: {
    name: 'morpho',
    displayName: 'Morpho',
    chainId: polygon.id,
    contracts: {
      morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    },
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-polygon',
    blockExplorer: 'https://polygonscan.com',
  },
}

// Helper to get protocol config by name and chain
export function getProtocolConfig(
  protocol: 'aave' | 'compound' | 'morpho',
  chainId: number
): ProtocolConfig | undefined {
  switch (protocol) {
    case 'aave':
      return AAVE_CONFIG[chainId]
    case 'compound':
      return COMPOUND_CONFIG[chainId]
    case 'morpho':
      return MORPHO_CONFIG[chainId]
    default:
      return undefined
  }
}

// Get all supported protocols for a chain
export function getSupportedProtocols(chainId: number): ProtocolConfig[] {
  const protocols: ProtocolConfig[] = []

  if (AAVE_CONFIG[chainId]) protocols.push(AAVE_CONFIG[chainId])
  if (COMPOUND_CONFIG[chainId]) protocols.push(COMPOUND_CONFIG[chainId])
  if (MORPHO_CONFIG[chainId]) protocols.push(MORPHO_CONFIG[chainId])

  return protocols
}

// ============================================================================
// PROTOCOL ADAPTER REGISTRY
// ============================================================================
// This is the single source of truth for which protocols the app supports.
//
// HOW TO ADD A NEW PROTOCOL:
// 1. Add the protocol name to the Protocol union type in @/types/lending
// 2. Create an adapter in @/lib/adapters/[protocol] that implements ProtocolAdapter
// 3. Add a new entry to SUPPORTED_PROTOCOLS array below
// 4. (Optional) Add protocol config to AAVE_CONFIG, COMPOUND_CONFIG, etc. if needed
//
// HOW TO REMOVE A PROTOCOL:
// 1. Remove the entry from SUPPORTED_PROTOCOLS array
// 2. Remove from Protocol union type in @/types/lending
// 3. The rest of the app will automatically adapt
//
// The dynamic import ensures code-splitting and lazy loading of adapters.
// ============================================================================

export const SUPPORTED_PROTOCOLS: ProtocolRegistryEntry[] = [
  {
    name: 'morpho',
    adapter: async () => {
      const { MorphoAdapter } = await import('@/lib/adapters/morpho')
      return MorphoAdapter
    },
  },
  // {
  //   name: 'aave',
  //   adapter: async () => {
  //     const { AaveAdapter } = await import('@/lib/adapters/aave')
  //     return AaveAdapter
  //   },
  // },
  // {
  //   name: 'compound',
  //   adapter: async () => {
  //     const { CompoundAdapter } = await import('@/lib/adapters/compound')
  //     return CompoundAdapter
  //   },
  // },
]

// Helper to get all protocol names
export function getProtocolNames(): ProtocolName[] {
  return SUPPORTED_PROTOCOLS.map((p) => p.name)
}
