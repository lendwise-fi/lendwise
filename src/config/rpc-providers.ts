/**
 * Node providers and the URL of each network they serve. Pure: no
 * environment access, so both the browser config (`chains.ts`) and the server
 * config (`rpc.server.ts`) build on it. Switching provider means adding a
 * table here and changing variables, nothing else.
 */

/** Networks reached over RPC: every tx chain (registry slugs), Stellar's Soroban RPC and Solana. */
export const RPC_NETWORKS = [
  'ethereum',
  'arbitrum',
  'optimism',
  'polygon',
  'base',
  'linea',
  'avalanche',
  'bsc',
  'celo',
  'zksync',
  'mantle',
  'scroll',
  'unichain',
  'hyperevm',
  'megaeth',
  'monad',
  'stellar',
  'solana',
] as const
export type RpcNetwork = (typeof RPC_NETWORKS)[number]

export const RPC_PROVIDERS = ['infura', 'drpc'] as const
export type RpcProvider = (typeof RPC_PROVIDERS)[number]

interface ProviderTable {
  /** Provider-side network name; null = not served by this provider. */
  networks: Record<RpcNetwork, string | null>
  url(network: string, key: string): string
}

const PROVIDERS: Record<RpcProvider, ProviderTable> = {
  infura: {
    networks: {
      ethereum: 'mainnet',
      arbitrum: 'arbitrum-mainnet',
      optimism: 'optimism-mainnet',
      polygon: 'polygon-mainnet',
      base: 'base-mainnet',
      linea: 'linea-mainnet',
      avalanche: 'avalanche-mainnet',
      bsc: 'bsc-mainnet',
      celo: 'celo-mainnet',
      zksync: 'zksync-mainnet',
      mantle: 'mantle-mainnet',
      scroll: 'scroll-mainnet',
      unichain: 'unichain-mainnet',
      hyperevm: 'hyperevm-mainnet',
      megaeth: 'megaeth-mainnet',
      monad: 'monad-mainnet',
      stellar: 'stellar-mainnet',
      // Not served: Solana runs on its public RPC (PUBLIC_RPC_DEFAULTS).
      solana: null,
    },
    url: (network, key) => `https://${network}.infura.io/v3/${key}`,
  },
  // Network names checked live against lb.drpc.live on 2026-10-14.
  drpc: {
    networks: {
      ethereum: 'ethereum',
      arbitrum: 'arbitrum',
      optimism: 'optimism',
      polygon: 'polygon',
      base: 'base',
      linea: 'linea',
      avalanche: 'avalanche',
      bsc: 'bsc',
      celo: 'celo',
      zksync: 'zksync',
      mantle: 'mantle',
      scroll: 'scroll',
      unichain: 'unichain',
      hyperevm: 'hyperliquid',
      megaeth: 'megaeth',
      monad: 'monad',
      stellar: 'stellar',
      // dRPC serves Solana on paid plans only, unverified for our key.
      solana: null,
    },
    url: (network, key) => `https://lb.drpc.live/${network}/${key}`,
  },
}

/**
 * Networks the server reaches on a public endpoint when no `RPC_URL_<SLUG>`
 * is set, never through a provider key. Solana: dRPC serves it on paid plans
 * only (unverified for our key) and Infura not at all, so the provider tables
 * above hold `null` for it and the public mainnet RPC (100 req/10 s per IP)
 * is the default, paced by `src/lib/solana/rpc.ts`.
 */
export const PUBLIC_RPC_DEFAULTS: Partial<Record<RpcNetwork, string>> = {
  solana: 'https://api.mainnet-beta.solana.com',
}

const NETWORKS: ReadonlySet<string> = new Set(RPC_NETWORKS)

export function isRpcNetwork(value: string): value is RpcNetwork {
  return NETWORKS.has(value)
}

export function isRpcProvider(value: string | undefined): value is RpcProvider {
  return value !== undefined && Object.hasOwn(PROVIDERS, value)
}

/** The provider's URL for a network, or null when it does not serve it. */
export function rpcUrl(
  provider: RpcProvider,
  network: RpcNetwork,
  key: string
): string | null {
  if (!key) throw new Error(`RPC key for ${provider} is empty`)
  const table = PROVIDERS[provider]
  const name = table.networks[network]
  return name === null ? null : table.url(name, key)
}
