'use client'

import React, { useState } from 'react'
import { useWalletStore, type Wallet } from '@/stores/walletStore'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import {
  Settings,
  Plus,
  ChevronUp,
  Wallet as WalletIcon,
  PanelRight,
} from 'lucide-react'
import { WalletAvatar } from './wallet-avatar'
import { useEnsName } from 'wagmi'

const WalletRow = ({ wallet }: { wallet: Wallet }) => {
  const { data: ensName } = useEnsName({
    address: wallet.address as `0x${string}`,
  })

  return (
    <div className="flex items-center gap-3 rounded-md p-2 hover:bg-accent">
      <WalletAvatar address={wallet.address} size={32} />
      <span className="text-sm font-medium">{ensName || wallet.name}</span>
    </div>
  )
}

export function InfoSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const { wallets } = useWalletStore()

  const toggle = () => setIsOpen(!isOpen)

  return (
    <aside
      className={cn(
        'group relative border-r border-border bg-card/50 transition-all duration-300 ease-in-out flex flex-col',
        isOpen ? 'w-72' : 'w-20'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="absolute top-2 -right-3 z-10 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <PanelRight className="h-4 w-4" />
      </Button>
      <div className="relative flex-1 overflow-hidden">
        <div
          className={cn(
            'absolute inset-0 h-full transition-opacity duration-200',
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-auto',
            !isOpen && 'opacity-0 pointer-events-none'
          )}
        >
          {/* Expanded View */}
          <div className="flex h-full flex-col p-4">
            <div className="flex items-center justify-between pb-4">
              <h2 className="text-xl font-bold">Accounts</h2>
              <div className="flex items-center">
                <Button variant="ghost" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mb-2 flex items-center justify-between rounded-md p-2 hover:bg-accent cursor-pointer">
              <span className="font-semibold">Decentralized</span>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {wallets.map((wallet) => (
                <WalletRow key={wallet.address} wallet={wallet} />
              ))}
            </div>
          </div>
        </div>

        <div
          className={cn(
            'absolute inset-0 h-full transition-opacity duration-200',
            !isOpen ? 'opacity-100' : 'opacity-0 pointer-events-auto',
            isOpen && 'opacity-0 pointer-events-none'
          )}
        >
          {/* Collapsed View */}
          <div className="flex h-full flex-col items-center space-y-4 p-4">
            <Button variant="ghost" size="icon">
              <Plus className="h-5 w-5" />
            </Button>
            <div className="flex items-center justify-center rounded-md bg-accent p-2 text-accent-foreground">
              <WalletIcon className="h-5 w-5" />
              <ChevronUp className="h-4 w-4 ml-1" />
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto pt-2">
              {wallets.map((wallet) => (
                <WalletAvatar
                  key={wallet.address}
                  address={wallet.address}
                  size={32}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
