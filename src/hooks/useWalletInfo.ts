import { formatAddress } from '@/lib/utils'
import { useAccount, useBalance } from 'wagmi'

export type WalletInfo = {
  status: {
    label: 'Status'
    value: string
    wallet: string
  }
  address: {
    label: 'Address'
    value: string
    shortValue?: string
    copyable: true
  }
  chain: {
    label: 'Network'
    value: string
    id: number
    testnet: boolean
  }
  balance: {
    label: 'Balance'
    value: string
    symbol: string
    decimals: number
    formatted: string
  }
}

export const useWalletInfo = () => {
  const { address, chain, chainId, status, connector } = useAccount()
  const { data: balance } = useBalance({ address })

  const walletInfo: WalletInfo = {
    status: {
      label: 'Status',
      value: status,
      wallet: connector?.name ?? '',
    },
    address: {
      label: 'Address',
      value: address ?? '',
      shortValue: address ? formatAddress(address) : '',
      copyable: true,
    },
    chain: {
      label: 'Network',
      value: chain?.name ?? '',
      id: chainId ?? 0,
      testnet: chain?.testnet ?? false,
    },
    balance: {
      label: 'Balance',
      value: balance?.value?.toString() ?? '0',
      decimals: balance?.decimals ?? 0,
      symbol: balance?.symbol ?? '',
      formatted: balance?.formatted ?? '0',
    },
  }

  return walletInfo
}
