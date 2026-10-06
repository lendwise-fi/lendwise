import { type Address, isAddress } from 'viem'

import type { PortfolioWalletInput } from './types'

export interface RoutedPortfolioWallets {
  evmAddresses: Address[]
  stellarAddresses: string[]
}

export function routePortfolioWallets(
  wallets: PortfolioWalletInput[]
): RoutedPortfolioWallets {
  const evmAddresses: Address[] = []
  const stellarAddresses: string[] = []

  for (const wallet of wallets) {
    if (wallet.chainFamily === 'evm') {
      if (isAddress(wallet.address)) evmAddresses.push(wallet.address)
      continue
    }

    if (wallet.chainFamily === 'stellar') {
      stellarAddresses.push(wallet.address)
    }
  }

  return { evmAddresses, stellarAddresses }
}
