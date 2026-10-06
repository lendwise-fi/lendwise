import type { Address } from 'viem'

export type CctpEnvironment = 'testnet' | 'mainnet'
export type CctpTransferFinality = 'fast' | 'standard'

export const STELLAR_CCTP_DOMAIN = 27
export const CCTP_FAST_FINALITY_THRESHOLD = 1000
export const CCTP_STANDARD_FINALITY_THRESHOLD = 2000

export const CCTP_EVM_CHAIN_IDS = {
  ethereum: 1,
  avalanche: 43114,
  optimism: 10,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  unichain: 130,
  linea: 59144,
  codex: 81224,
  sonic: 146,
  worldchain: 480,
  monad: 143,
  sei: 1329,
  xdc: 50,
  hyperevm: 999,
  ink: 57073,
  plume: 98866,
  arc: 504,
  edge: 0,
  morph: 2818,
  pharos: 0,
  cronos: 25,
  plasma: 9745,
  xlayer: 196,
} as const

export const CCTP_EVM_DOMAINS = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
  unichain: 10,
  linea: 11,
  codex: 12,
  sonic: 13,
  worldchain: 14,
  monad: 15,
  sei: 16,
  xdc: 18,
  hyperevm: 19,
  ink: 21,
  plume: 22,
  arc: 26,
  edge: 28,
  morph: 30,
  pharos: 31,
  cronos: 32,
  plasma: 33,
  xlayer: 37,
} as const

export type CctpEvmChainSlug = keyof typeof CCTP_EVM_DOMAINS

export interface StellarCctpContracts {
  tokenMessengerMinter: string
  messageTransmitter: string
  cctpForwarder: string
}

export const STELLAR_CCTP_CONTRACTS: Record<
  CctpEnvironment,
  StellarCctpContracts
> = {
  mainnet: {
    tokenMessengerMinter:
      'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL',
    messageTransmitter:
      'CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV',
    cctpForwarder: 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T',
  },
  testnet: {
    tokenMessengerMinter:
      'CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP',
    messageTransmitter:
      'CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY',
    cctpForwarder: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
  },
}

export interface EvmCctpContracts {
  tokenMessengerV2: Address
  usdc: Address
  sourceDomain: number
}

export function cctpFinalityThreshold(finality: CctpTransferFinality): number {
  return finality === 'fast'
    ? CCTP_FAST_FINALITY_THRESHOLD
    : CCTP_STANDARD_FINALITY_THRESHOLD
}

export function cctpIrisBaseUrl(environment: CctpEnvironment): string {
  return environment === 'mainnet'
    ? 'https://iris-api.circle.com'
    : 'https://iris-api-sandbox.circle.com'
}

export function cctpEnvironmentFromNetworkPassphrase(
  networkPassphrase: string
): CctpEnvironment {
  return networkPassphrase === 'Public Global Stellar Network ; September 2015'
    ? 'mainnet'
    : 'testnet'
}
