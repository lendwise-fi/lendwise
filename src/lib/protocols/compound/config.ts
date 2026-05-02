import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'

import type { ProtocolConfig } from '@/config/protocols'

import { CHAIN_SLUG_MAP } from '../chain-slugs'

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
          slug: CHAIN_SLUG_MAP[mainnet.id],
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/5nwMCSHaTqG3Kd2gHznbTXEnZ9QNWsssQfbHhDqQSQFp',
          // 'https://gateway.thegraph.com/api/subgraphs/id/AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9', # MESSARI SUBGRAPH
          clientPath: 'ethereum',
        },
      },
      [polygon.id]: {
        ...polygon,
        custom: {
          slug: CHAIN_SLUG_MAP[polygon.id],
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/AaFtUWKfFdj2x8nnE3RxTSJkHwGHvawH3VWFBykCGzLs',
          // 'https://gateway.thegraph.com/api/subgraphs/id/5wfoWBpfYv59b99wDxJmyFiKBu9brXESeqJAzw8WP5Cz', # MESSARI SUBGRAPH
          clientPath: 'polygon',
        },
      },
      [arbitrum.id]: {
        ...arbitrum,
        custom: {
          slug: CHAIN_SLUG_MAP[arbitrum.id],
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/Ff7ha9ELmpmg81D6nYxy4t8aGP26dPztqD1LDJNPqjLS',
          // 'https://gateway.thegraph.com/api/subgraphs/id/5MjRndNWGhqvNX7chUYLQDnvEgc8DaH8eisEkcJt71SR', # MESSARI SUBGRAPH
          clientPath: 'arbitrum',
        },
      },
      [base.id]: {
        ...base,
        custom: {
          slug: CHAIN_SLUG_MAP[base.id],
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/2hcXhs36pTBDVUmk5K2Zkr6N4UYGwaHuco2a6jyTsijo',
          // 'https://gateway.thegraph.com/api/subgraphs/id/99XPkR9F1exRDdCNyfXrCfEon4K34YoTDn6dgXKmxC72', # MESSARI SUBGRAPH
          clientPath: 'base',
        },
      },
      [optimism.id]: {
        ...optimism,
        custom: {
          slug: CHAIN_SLUG_MAP[optimism.id],
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/FhHNkfh5z6Z2WCEBxB6V3s8RPxnJfWZ9zAfM5bVvbvbb',
          clientPath: 'optimism',
        },
      },
    },
  },
}
