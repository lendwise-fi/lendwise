'use client'

import { useState } from 'react'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Check, Copy } from 'lucide-react'
import { Address } from 'viem'
import { useAccount, useEnsName } from 'wagmi'

import { Button } from '@/components/ui/button'
import { type Wallet, useWalletStore } from '@/stores/walletStore'

import { WalletAvatar } from '../wallet/WalletAvatar'

const WalletRow = ({ wallet }: { wallet: Wallet }) => {
  const { data: ensName } = useEnsName({
    address: wallet.address as Address,
  })
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => {
      setCopiedAddress(null)
    }, 2000)
  }

  return (
    <div
      key={wallet.address}
      className="hover:bg-accent flex items-center justify-between rounded-md p-2"
    >
      <div className="flex items-center gap-x-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full">
          <WalletAvatar address={wallet.address} size={30} />
        </div>
        <span className="text-sm font-medium">{ensName || wallet.name}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => handleCopy(wallet.address)}
      >
        {copiedAddress === wallet.address ? (
          <Check className="text-success h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

export const UserWalletList = () => {
  const { wallets } = useWalletStore()
  const { connector, isConnected } = useAccount()

  const handleAddWallet = async () => {
    if (!isConnected || !connector) {
      // Si pas connecté, on ne peut pas ouvrir le wallet
      return
    }

    try {
      // Récupérer le provider du wallet connecté
      const provider = await connector.getProvider()

      // Vérifier que c'est un provider EIP-1193
      if (
        provider &&
        typeof provider === 'object' &&
        provider !== null &&
        'request' in provider &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (provider as any).request === 'function'
      ) {
        // Demander au wallet de changer de compte (ouvre MetaMask directement)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (provider as any).request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        })
      }
    } catch (error) {
      console.error('Failed to request account change:', error)
    }
  }

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-muted-foreground text-sm font-medium">Mes Wallets</p>
        {isConnected ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleAddWallet}
          >
            + Add
          </Button>
        ) : (
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => {
              if (!mounted) return null
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={openConnectModal}
                >
                  + Add
                </Button>
              )
            }}
          </ConnectButton.Custom>
        )}
      </div>
      <div className="space-y-1">
        {wallets.length > 0 ? (
          wallets.map((wallet) => (
            <WalletRow key={wallet.address} wallet={wallet} />
          ))
        ) : (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">
            No wallets connected.
          </p>
        )}
      </div>
    </div>
  )
}
