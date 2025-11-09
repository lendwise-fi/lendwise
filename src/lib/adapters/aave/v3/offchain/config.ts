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

export const AAVE_V3_MARKETS_PARAMS = [
  {
    id: 'AaveV3Ethereum',
    name: 'Aave V3 Ethereum',
    address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    chainId: mainnet.id,
  },
  {
    id: 'AaveV3EthereumLido',
    name: 'Aave V3 Ethereum Lido',
    address: '0x4e033931ad43597d96D6bcc25c280717730B58B1',
    chainId: mainnet.id,
  },
  {
    id: 'AaveV3EthereumHorizon',
    name: 'Aave V3 Ethereum Horizon',
    address: '0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8',
    chainId: mainnet.id,
  },
  {
    id: 'AaveV3EthereumEtherFi',
    name: 'Aave V3 Ethereum EtherFi',
    address: '0x0AA97c284e98396202b6A04024F5E2c65026F3c0',
    chainId: mainnet.id,
  },
  {
    id: 'AaveV3Linea',
    name: 'Aave V3 Linea',
    address: '0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac',
    chainId: linea.id,
  },
  {
    id: 'AaveV3Base',
    name: 'Aave V3 Base',
    address: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    chainId: base.id,
  },
  {
    id: 'AaveV3Gnosis',
    name: 'Aave V3 Gnosis',
    address: '0xb50201558B00496A145fE76f7424749556E326D8',
    chainId: gnosis.id,
  },
  {
    id: 'AaveV3Optimism',
    name: 'Aave V3 Optimism',
    address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    chainId: optimism.id,
  },
  {
    id: 'AaveV3Plasma',
    name: 'Aave V3 Plasma',
    address: '0x925a2A7214Ed92428B5b1B090F80b25700095e12',
    chainId: plasma.id,
  },
  {
    id: 'AaveV3Scroll',
    name: 'Aave V3 Scroll',
    address: '0x11fCfe756c05AD438e312a7fd934381537D3cFfe',
    chainId: scroll.id,
  },
  {
    id: 'AaveV3ZkSync',
    name: 'Aave V3 ZkSync',
    address: '0x78e30497a3c7527d953c6B1E3541b021A98Ac43c',
    chainId: zksync.id,
  },
  {
    id: 'AaveV3Sonic',
    name: 'Aave V3 Sonic',
    address: '0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3',
    chainId: sonic.id,
  },
  {
    id: 'AaveV3Ink',
    name: 'Aave V3 Ink',
    address: '0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA',
    chainId: ink.id,
  },
  {
    id: 'AaveV3Sonic',
    name: 'Aave V3 Sonic',
    address: '0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3',
    chainId: sonic.id,
  },
  {
    id: 'AaveV3Celo',
    name: 'Aave V3 Celo',
    address: '0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402',
    chainId: celo.id,
  },
  {
    id: 'AaveV3Metis',
    name: 'Aave V3 Metis',
    address: '0x90df02551bB792286e8D4f13E0e357b4Bf1D6a57',
    chainId: metis.id,
  },
  {
    id: 'AaveV3Soneium',
    name: 'Aave V3 Soneium',
    address: '0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B',
    chainId: soneium.id,
  },
  {
    id: 'AaveV3Arbitrum',
    name: 'Aave V3 Arbitrum',
    address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    chainId: arbitrum.id,
  },
  {
    id: 'AaveV3Avalanche',
    name: 'Aave V3 Avalanche',
    address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    chainId: avalanche.id,
  },
  {
    id: 'AaveV3Polygon',
    name: 'Aave V3 Polygon',
    address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    chainId: polygon.id,
  },
  {
    id: 'AaveV3BNB',
    name: 'Aave V3 BNB',
    address: '0x6807dc923806fE8Fd134338EABCA509979a7e0cB',
    chainId: bsc.id,
  },
]

/**
 * Get all markets to build Graphql query params.
 *
 * @returns Array of all markets with their chain information
 *
 * @example
 * ```typescript
 * const markets = getAllMarkets()
 * // [
 * //   { chainId: 1, address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' },
 * //   { chainId: 137, address: '0x4e033931ad43597d96D6bcc25c280717730B58B1' },
 * // ]
 * ```
 */
export function getAllMarkets() {
  return AAVE_V3_MARKETS_PARAMS.map((market) => ({
    chainId: market.chainId,
    address: market.address,
  }))
}

export const ALL_MARKETS_GQL_PARAMS = { markets: getAllMarkets() }
