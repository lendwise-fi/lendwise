import {
  arbitrum,
  avalanche,
  base,
  bsc,
  gnosis,
  linea,
  mainnet,
  metis,
  optimism,
  polygon,
  scroll,
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
            'https://gateway.thegraph.com/api/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk',
          clientPath: 'ethereum',
        },
      },
      [polygon.id]: {
        ...polygon,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/6yuf1C49aWEscgk5n9D1DekeG1BCk5Z9imJYJT3sVmAT',
          clientPath: 'polygon',
        },
      },
      [arbitrum.id]: {
        ...arbitrum,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf',
          clientPath: 'arbitrum',
        },
      },
      [linea.id]: {
        ...linea,
        custom: {
          // subgraphUrl:
          //   'https://gateway.thegraph.com/api/subgraphs/id/5Yykt9vDGxjfQE7Rcmw5B5fezoVA4mnL3rDKN27JvYQb',
          // clientPath: 'linea',
        },
      },
      [base.id]: {
        ...base,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9',
          clientPath: 'base',
        },
      },
      [gnosis.id]: {
        ...gnosis,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/GiNMLDxT1Bdn2dQZxjQLmW24uwpc3geKUBW8RP6oEdg',
          clientPath: 'gnosis',
        },
      },
      [optimism.id]: {
        ...optimism,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/3RWFxWNstn4nP3dXiDfKi9GgBoHx7xzc7APkXs1MLEgi',
          clientPath: 'optimism',
        },
      },
      [avalanche.id]: {
        ...avalanche,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/72Cez54APnySAn6h8MswzYkwaL9KjvuuKnKArnPJ8yxb',
          clientPath: 'avalanche',
        },
      },
      // [plasma.id]: {
      //   ...plasma,
      //   custom: {
      //     subgraphUrl:
      //       'https://gateway.thegraph.com/api/subgraphs/id/4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf',
      //     clientPath: 'plasma',
      //   },
      // },
      [scroll.id]: {
        ...scroll,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/DkvXMxq1skgSe1ehLHWpiUthHU1znnMDK2SUmj9avhEX',
          clientPath: 'scroll',
        },
      },
      [zksync.id]: {
        ...zksync,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/F1LzJN9yPCvTki3vmyb9EgUR74n6F2RfXwe4ngr1C6p6',
          clientPath: 'zksync',
        },
      },
      [sonic.id]: {
        ...sonic,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/6CdwDvShygJALhezEZofxTnAFuckFxQ88Ud8oXVbyeTz',
          clientPath: 'sonic',
        },
      },
      // [ink.id]: {
      //   ...ink,
      //   custom: {
      //     subgraphUrl:
      //       'https://gateway.thegraph.com/api/subgraphs/id/4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf',
      //     clientPath: 'ink',
      //   },
      // },
      [bsc.id]: {
        ...bsc,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/43jbGkvSw55sMvYyF6MZieksmJbajMu3hNGF8PN9ucuP',
          clientPath: 'bsc',
        },
      },
      // [celo.id]: {
      //   ...celo,
      //   custom: {
      //     subgraphUrl:
      //       'https://gateway.thegraph.com/api/subgraphs/id/4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf',
      //     clientPath: 'celo',
      //   },
      // },
      [metis.id]: {
        ...metis,
        custom: {
          subgraphUrl:
            'https://gateway.thegraph.com/api/subgraphs/id/6T9scnLFxAwcs874DgHNjRp8ZCCRh3vuBvyCUiMM3AKQ',
          clientPath: 'metis',
        },
      },
      // [soneium.id]: {
      //   ...soneium,
      //   custom: {
      //     subgraphUrl:
      //       'https://gateway.thegraph.com/api/subgraphs/id/4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf',
      //     clientPath: 'soneium',
      //   },
      // },
    },
  },
}
