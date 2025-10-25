import { ProtocolConfig } from '@/types/defi'
import { mainnet, polygon, arbitrum, base } from 'viem/chains'

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
