import { arbitrum, mainnet, optimism, polygon } from 'viem/chains'

import type { ProtocolConfig } from '@/config/protocols'

/**
 * Centralized configuration for all Compound versions and chains.
 * This includes contract addresses, subgraph URLs, and chain-specific settings.
 */
export const COMPOUND_CONFIG: Record<string, ProtocolConfig> = {
  compound_v3: {
    id: 'compound_v3',
    name: 'Compound v3',
    chains: {
      [mainnet.id]: {
        ...mainnet,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9',
          clientPath: 'ethereum',
        },
      },
      [polygon.id]: {
        ...polygon,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/5wfoWBpfYv59b99wDxJmyFiKBu9brXESeqJAzw8WP5Cz',
          clientPath: 'polygon',
        },
      },
      [arbitrum.id]: {
        ...arbitrum,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/5MjRndNWGhqvNX7chUYLQDnvEgc8DaH8eisEkcJt71SR',
          clientPath: 'arbitrum',
        },
      },
      // [base.id]: {
      //   ...base,
      //   custom: {
      //     subgraphUrl:
      //       'https://gateway.thegraph.com/api/subgraphs/id/99XPkR9F1exRDdCNyfXrCfEon4K34YoTDn6dgXKmxC72',
      //     clientPath: 'base',
      //   },
      // },
      [optimism.id]: {
        ...optimism,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/FhHNkfh5z6Z2WCEBxB6V3s8RPxnJfWZ9zAfM5bVvbvbb',
          clientPath: 'optimism',
        },
      },
    },
  },
}
