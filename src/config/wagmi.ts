import { getDefaultConfig } from '@rainbow-me/rainbowkit'

import { ALL_CHAINS, CHAIN_TRANSPORTS } from './chains'

// Vérifier que les variables d'environnement sont définies
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID

if (!projectId) {
  throw new Error('NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID is not defined')
}

// Configuration Wagmi avec support SSR
export const config = getDefaultConfig({
  appName: 'Yield Optimizer',
  projectId,
  chains: ALL_CHAINS,
  ssr: true,
  transports: CHAIN_TRANSPORTS,
})
