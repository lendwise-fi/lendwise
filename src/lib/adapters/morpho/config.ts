import {
  arbitrum,
  base,
  katana,
  mainnet,
  optimism,
  polygon,
  unichain,
} from 'viem/chains'

import type { ProtocolConfig } from '@/config/protocols'

/**
 * Centralized configuration for all Morpho versions and chains.
 */
export const MORPHO_CONFIG: Record<string, ProtocolConfig> = {
  morpho_v1: {
    id: 'morpho_v1',
    name: 'Morpho',
    offchainApiUrl: 'https://api.morpho.org/graphql',
    chains: {
      [mainnet.id]: {
        ...mainnet,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-mainnet',
        },
      },
      [base.id]: {
        ...base,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-base',
        },
      },
      [arbitrum.id]: {
        ...arbitrum,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-arbitrum',
        },
      },
      [polygon.id]: {
        ...polygon,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-polygon',
        },
      },
      [optimism.id]: {
        ...optimism,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-optimism',
        },
      },
      [katana.id]: {
        ...katana,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-optimism',
        },
      },
      [unichain.id]: {
        ...unichain,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-optimism',
        },
      },
    },
  },
}
