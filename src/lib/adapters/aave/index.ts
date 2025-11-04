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

import { GraphqlProtocolAdapter } from '../types'
import { gqlAdapter } from './gql'

// import { subgraphAdapter } from './subgraph'

// ============================================================================
// AAVE Protocol Identifier
// ============================================================================
export const PROTOCOL_ID = 'aave' as const

// ============================================================================
// AAVE V3 Protocol Configuration
// ============================================================================
export const AAVE_CONFIG: Record<number, ProtocolConfig> = {
  [mainnet.id]: {
    name: PROTOCOL_ID,
    displayName: 'AaveV3Ethereum',
    chainId: mainnet.id,
    contracts: {
      pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      dataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
      oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
    },
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
    blockExplorer: 'https://etherscan.io',
    markets: [
      {
        name: 'AaveV3Ethereum',
        address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      },
      {
        name: 'AaveV3EthereumLido',
        address: '0x4e033931ad43597d96D6bcc25c280717730B58B1',
      },
      {
        name: 'AaveV3EthereumHorizon',
        address: '0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8',
      },
    ],
  },
  [polygon.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: polygon.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1',
    },
    markets: [
      {
        name: 'AaveV3Polygon',
        address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
    blockExplorer: 'https://polygonscan.com',
  },
  [arbitrum.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: arbitrum.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Arbitrum',
        address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [linea.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: linea.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Linea',
        address: '0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [base.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: base.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Base',
        address: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [avalanche.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: avalanche.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Avalanche',
        address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [optimism.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: optimism.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Optimism',
        address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [gnosis.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: gnosis.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Gnosis',
        address: '0xb50201558B00496A145fE76f7424749556E326D8',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [plasma.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: plasma.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Plasma',
        address: '0x925a2A7214Ed92428B5b1B090F80b25700095e12',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [sonic.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: sonic.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Sonic',
        address: '0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [ink.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: ink.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Ink',
        address: '0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [bsc.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: bsc.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3BNB',
        address: '0x6807dc923806fE8Fd134338EABCA509979a7e0cB',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [scroll.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: scroll.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Scroll',
        address: '0x11fCfe756c05AD438e312a7fd934381537D3cFfe',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [zksync.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: zksync.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3ZkSync',
        address: '0x78e30497a3c7527d953c6B1E3541b021A98Ac43c',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [celo.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: celo.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Celo',
        address: '0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [metis.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: metis.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Metis',
        address: '0x90df02551bB792286e8D4f13E0e357b4Bf1D6a57',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
  [soneium.id]: {
    name: PROTOCOL_ID,
    displayName: 'Aave V3',
    chainId: soneium.id,
    contracts: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    },
    markets: [
      {
        name: 'AaveV3Soneium',
        address: '0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B',
      },
    ],
    subgraphUrl:
      'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
    blockExplorer: 'https://arbiscan.io',
  },
}

// ============================================================================
// AAVE Adapter
// ============================================================================
export const AaveAdapter: GraphqlProtocolAdapter = {
  protocol: PROTOCOL_ID,
  ...gqlAdapter,
  // stats: subgraphAdapter,
}

export const marketsGqlParams = {
  markets: Object.values(AAVE_CONFIG)
    .map((chain) =>
      chain.markets.map((market) => ({
        chainId: chain.chainId,
        address: market.address,
      }))
    )
    .flat(),
}

export const getAllMarkets = () =>
  Object.values(AAVE_CONFIG)
    .map((chain) =>
      chain.markets.map((market) => ({
        name: market.name,
        address: market.address,
        chainId: chain.chainId,
      }))
    )
    .flat()

export const buildHealthFactorQuery = (userAddress: string) => {
  const markets = getAllMarkets()
  const queryFields = markets
    .map(
      (market) => `
  ${market.name}: userMarketState(request: { 
    user: "${userAddress.toLowerCase()}",
    chainId: ${market.chainId},
    market: "${market.address.toLowerCase()}"
  }) {
    healthFactor
  }`
    )
    .join('\n')

  return `
query GetHealthFactors {
${queryFields}
}
`
}

export const buildHealthFactorQueryForMarkets = (marketNames: string[]) => {
  const allMarkets = getAllMarkets()
  const filteredMarkets = allMarkets.filter((market) =>
    marketNames.includes(market.name)
  )

  if (filteredMarkets.length === 0) {
    return null
  }

  // Build query with variables for each market
  const queryFields = filteredMarkets
    .map(
      (market, index) => `
  ${market.name}: userMarketState(request: $request${index}) {
    healthFactor
  }`
    )
    .join('\n')

  // Build variable definitions
  const variableDefinitions = filteredMarkets
    .map((_, index) => `$request${index}: UserMarketStateRequest!`)
    .join(', ')

  return {
    query: `
query GetHealthFactors(${variableDefinitions}) {
${queryFields}
}
`,
    markets: filteredMarkets,
  }
}
