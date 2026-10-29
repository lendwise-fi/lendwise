'use client'

import { useEffect, useState } from 'react'

import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Check, Copy, LogIn, MoreVertical, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Address } from 'viem'
import { useAccount, useDisconnect, useEnsName } from 'wagmi'
import { mainnet } from 'wagmi/chains'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NetworkFamilySelectorDialog } from '@/components/wallet/NetworkFamilySelectorDialog'
import { useSolanaWallet } from '@/contexts/SolanaWalletContext'
import { useStellarWallet } from '@/contexts/StellarWalletContext'
import { useConnectWalletFamily } from '@/hooks/useConnectWalletFamily'
import { useMultiWalletManager } from '@/hooks/useMultiWalletManager'
import { formatAddress } from '@/lib/utils'
import { expectReconnect, reconnectHint } from '@/lib/wallet/reconnect'
import { walletConnector } from '@/lib/wallet/wallet-families'
import {
  isWalletConnected,
  walletRowMenu,
  walletSubtitle,
} from '@/lib/wallet/wallet-label'
import { type Wallet, useWalletStore } from '@/stores/walletStore'

import { WalletAvatar } from '../wallet/WalletAvatar'

const WalletRow = ({ wallet }: { wallet: Wallet }) => {
  const { address: activeAddress, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { openConnectModal } = useConnectModal()
  const { updateWallet, clients, wallets } = useWalletStore()
  const { disconnectAddress } = useMultiWalletManager()
  const { connectStellar, disconnectStellar } = useStellarWallet()
  const { connectSolana, disconnectSolana } = useSolanaWallet()
  const { data: ensName } = useEnsName({
    address: wallet.address as Address,
    chainId: mainnet.id, // Always resolve ENS on mainnet
  })
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  // Update wallet store when ENS name is fetched
  useEffect(() => {
    if (ensName && ensName !== wallet.ens) {
      updateWallet(wallet.address, { ens: ensName })
    }
  }, [ensName, wallet.address, wallet.ens, updateWallet])

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => {
      setCopiedAddress(null)
    }, 2000)
  }

  // The wallet connects the account it is open on: the row's address is
  // recorded so a different account gets a hint (WalletWatcher,
  // connectStellar, connectSolana).
  const handleConnect = () => {
    const owner = walletConnector(wallet.chainFamily)
    if (owner === 'stellar') {
      expectReconnect(wallet.address, 'stellar')
      void connectStellar()
      return
    }
    if (owner === 'solana') {
      expectReconnect(wallet.address, 'solana')
      void connectSolana()
      return
    }
    if (openConnectModal) {
      expectReconnect(wallet.address, 'evm')
      openConnectModal()
      return
    }
    // Already connected on another account: RainbowKit has no connect window
    // then, switching accounts happens in the wallet.
    const hint = activeAddress
      ? reconnectHint({
          expected: wallet.address,
          actual: activeAddress,
          family: 'evm',
          walletName: connector?.name ?? 'Your wallet',
        })
      : null
    if (hint) toast.info(hint)
  }

  const handleDisconnect = () => {
    const owner = walletConnector(wallet.chainFamily)
    if (owner === 'stellar') {
      void disconnectStellar(wallet.address)
      return
    }
    if (owner === 'solana') {
      void disconnectSolana(wallet.address)
      return
    }

    const isActiveAddress =
      wallet.address.toLowerCase() === activeAddress?.toLowerCase()
    const isLastAddress = wallets.length === 1

    // Remove from our store
    disconnectAddress(wallet.address as Address)

    // If this is the active address or the last address, disconnect from wagmi
    if (isActiveAddress || isLastAddress) {
      disconnect()
    }
  }

  // Display ENS name if available, otherwise formatted address
  const displayName = wallet.ens || formatAddress(wallet.address)
  const hasClient = !!clients[wallet.address.toLowerCase()]
  const menu = walletRowMenu(wallet, hasClient)

  return (
    <div
      key={wallet.address}
      className="hover:bg-accent flex items-center justify-between rounded-md p-2"
    >
      <div className="flex items-center gap-x-3">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full">
          <WalletAvatar address={wallet.address} size={30} />
          {isWalletConnected(wallet, hasClient) && (
            <div className="bg-success absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{displayName}</span>
          <span className="text-muted-foreground text-xs">
            {walletSubtitle(wallet, hasClient)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.connect && (
              <DropdownMenuItem onClick={handleConnect}>
                <LogIn className="mr-2 h-4 w-4" />
                {menu.connect}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleDisconnect}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {menu.remove}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export const UserWalletList = () => {
  const { wallets } = useWalletStore()
  const [showNetworkDialog, setShowNetworkDialog] = useState(false)

  const connectWalletFamily = useConnectWalletFamily()

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-muted-foreground text-sm font-medium">My Wallets</p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-transparent text-xs"
          onClick={() => setShowNetworkDialog(true)}
        >
          + Add
        </Button>
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

      <NetworkFamilySelectorDialog
        open={showNetworkDialog}
        onOpenChange={setShowNetworkDialog}
        onSelect={connectWalletFamily}
      />
    </div>
  )
}
