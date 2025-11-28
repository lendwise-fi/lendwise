import { polygon } from 'viem/chains'

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
      // [mainnet.id]: {
      //   ...mainnet,
      //   custom: {
      //     subgraphUrl:
      //       'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-mainnet',
      //     clientPath: 'ethereum',
      //   },
      // },
      // [base.id]: {
      //   ...base,
      //   custom: {
      //     subgraphUrl:
      //       'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-base',
      //     clientPath: 'base',
      //   },
      // },
      // [arbitrum.id]: {
      //   ...arbitrum,
      //   custom: {
      //     subgraphUrl:
      //       'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-arbitrum',
      //     clientPath: 'arbitrum',
      //   },
      // },
      [polygon.id]: {
        ...polygon,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/EhFokmwryNs7qbvostceRqVdjc3petuD13mmdUiMBw8Y',
          clientPath: 'polygon',
        },
      },
      // [optimism.id]: {
      //   ...optimism,
      //   custom: {
      //     subgraphUrl:
      //       'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-optimism',
      //     clientPath: 'optimism',
      //   },
      // },
      // [katana.id]: {
      //   ...katana,
      //   custom: {
      //     subgraphUrl:
      //       'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-optimism',
      //     clientPath: 'katana',
      //   },
      // },
      // [unichain.id]: {
      //   ...unichain,
      //   custom: {
      //     subgraphUrl:
      //       'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-optimism',
      //     clientPath: 'unichain',
      //   },
      // },
    },
  },
}
