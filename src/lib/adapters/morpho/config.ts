import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'

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
            'https://gateway.thegraph.com/api/subgraphs/id/8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs',
          clientPath: 'ethereum',
        },
      },
      [base.id]: {
        ...base,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/71ZTy1veF9twER9CLMnPWeLQ7GZcwKsjmygejrgKirqs',
          clientPath: 'base',
        },
      },
      [arbitrum.id]: {
        ...arbitrum,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/XsJn88DNCHJ1kgTqYeTgHMQSK4LuG1LR75339QVeQ26',
          clientPath: 'arbitrum',
        },
      },
      [polygon.id]: {
        ...polygon,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/EhFokmwryNs7qbvostceRqVdjc3petuD13mmdUiMBw8Y',
          clientPath: 'polygon',
        },
      },
      [optimism.id]: {
        ...optimism,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/5y8d3K3vVCR7r5YwANGCjupLc3hUge54XvhYMEq3Jmq1',
          clientPath: 'optimism',
        },
      },
      // [katana.id]: {
      //   ...katana,
      //   custom: {
      //     // subgraphUrl:
      //     //   'https://gateway.thegraph.com/api/subgraphs/id/5y8d3K3vVCR7r5YwANGCjupLc3hUge54XvhYMEq3Jmq1',
      //     // clientPath: 'katana',
      //   },
      // },
      // [unichain.id]: {
      //   ...unichain,
      //   custom: {
      //     subgraphUrl:
      //       'https://gateway.thegraph.com/api/subgraphs/id/ESbNRVHte3nwhcHveux9cK4FFAZK3TTLc5mKQNtpYgmu',
      //     clientPath: 'unichain',
      //   },
      // },
    },
  },
}
