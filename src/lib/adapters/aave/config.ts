import {
  arbitrum,
  avalanche,
  base,
  bsc,
  celo,
  gnosis,
  ink,
  linea,
  mainnet,
  metis,
  optimism,
  plasma,
  polygon,
  scroll,
  soneium,
  sonic,
  zksync,
} from 'viem/chains'

import type { ProtocolConfig } from '@/config/protocols'

export const AAVE_CONFIG: Record<string, ProtocolConfig> = {
  aave_v3: {
    id: 'aave_v3',
    name: 'Aave v3',
    offchainApiUrl: 'https://api.v3.aave.com/graphql',
    chains: {
      [mainnet.id]: {
        ...mainnet,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
        },
      },
      [polygon.id]: {
        ...polygon,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
        },
      },
      [arbitrum.id]: {
        ...arbitrum,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
        },
      },
      [linea.id]: {
        ...linea,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [base.id]: {
        ...base,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [gnosis.id]: {
        ...gnosis,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [optimism.id]: {
        ...optimism,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [avalanche.id]: {
        ...avalanche,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [plasma.id]: {
        ...plasma,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [scroll.id]: {
        ...scroll,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [zksync.id]: {
        ...zksync,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [sonic.id]: {
        ...sonic,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [ink.id]: {
        ...ink,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [bsc.id]: {
        ...bsc,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [celo.id]: {
        ...celo,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [metis.id]: {
        ...metis,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
      [soneium.id]: {
        ...soneium,
        custom: {
          subgraphUrl:
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
        },
      },
    },
  },
}
