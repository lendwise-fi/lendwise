'use client'

import * as React from 'react'

import Image from 'next/image'

import { Activity, ArrowRight, Globe } from 'lucide-react'
import { motion } from 'motion/react'
import posthog from 'posthog-js'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ChainFamily } from '@/lib/protocols/core/toolkit/chain-slugs'
import { WALLET_FAMILIES } from '@/lib/wallet/wallet-families'

interface NetworkFamilySelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The families offered, in this order: every family by default. */
  families?: readonly ChainFamily[]
  /** Called once the dialog has closed, with the family the user chose. */
  onSelect: (family: ChainFamily) => void
}

interface FamilyCard {
  title: string
  description: string
  icon: string
  iconAlt: string
  iconClassName: string
  /** Card hover, icon tile and arrow colors: literal classes for Tailwind. */
  cardClassName: string
  tileClassName: string
  arrowClassName: string
}

// A new chain family fails to compile here until it has a card.
const CARDS: Record<ChainFamily, FamilyCard> = {
  evm: {
    title: 'EVM Wallet',
    description:
      'MetaMask, Rabby, Coinbase and more, on Ethereum, Arbitrum, Base, Optimism, Polygon and other EVM chains.',
    icon: '/icons/network/ethereum.svg',
    iconAlt: 'Ethereum',
    iconClassName: 'h-7 w-7',
    cardClassName: 'hover:border-primary/40 hover:bg-primary/5',
    tileClassName: 'border-primary/20 bg-primary/10 text-primary',
    arrowClassName: 'group-hover:text-primary',
  },
  stellar: {
    title: 'Stellar Wallet',
    description:
      'Freighter, xBull, Lobstr or Albedo, for Blend markets on Stellar.',
    icon: '/icons/network/stellar.svg',
    iconAlt: 'Stellar',
    iconClassName: 'h-7 w-7 dark:invert',
    cardClassName: 'hover:border-indigo-500/40 hover:bg-indigo-500/5',
    tileClassName: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-500',
    arrowClassName: 'group-hover:text-indigo-500',
  },
  solana: {
    title: 'Solana Wallet',
    description: 'Phantom or Solflare, for Kamino Lend markets on Solana.',
    icon: '/icons/network/solana.svg',
    iconAlt: 'Solana',
    iconClassName: 'h-7 w-7',
    cardClassName: 'hover:border-purple-500/40 hover:bg-purple-500/5',
    tileClassName: 'border-purple-500/20 bg-purple-500/10 text-purple-500',
    arrowClassName: 'group-hover:text-purple-500',
  },
}

export function NetworkFamilySelectorDialog({
  open,
  onOpenChange,
  families = WALLET_FAMILIES,
  onSelect,
}: NetworkFamilySelectorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card/95 border-border overflow-hidden rounded-2xl p-0 shadow-2xl backdrop-blur-xl sm:max-w-120">
        {/* Glow Effects */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="bg-primary/10 absolute top-[-40%] left-[-20%] h-62.5 w-62.5 rounded-full blur-3xl" />
          <div className="absolute right-[-20%] bottom-[-40%] h-62.5 w-62.5 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col gap-6 p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="font-outfit from-foreground to-foreground/80 bg-linear-to-r bg-clip-text text-2xl font-bold text-transparent">
              Connect a Wallet
            </DialogTitle>
            <DialogDescription className="text-muted-foreground/90 mt-1 text-sm">
              Choose the network your wallet runs on. You can connect several
              and manage your yields across chains.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {families.map((family) => {
              const card = CARDS[family]
              return (
                <motion.button
                  key={family}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    posthog.capture('wallet_connected', {
                      chain_family: family,
                    })
                    onOpenChange(false)
                    onSelect(family)
                  }}
                  className={`group border-border/80 bg-card relative flex cursor-pointer items-center justify-between rounded-2xl border p-5 text-left shadow-xs transition-all ${card.cardClassName}`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-transform group-hover:scale-110 ${card.tileClassName}`}
                    >
                      <Image
                        src={card.icon}
                        alt={card.iconAlt}
                        width={28}
                        height={28}
                        className={card.iconClassName}
                      />
                    </div>
                    <div>
                      <h4 className="text-foreground text-base font-semibold">
                        {card.title}
                      </h4>
                      <p className="text-muted-foreground mt-1 max-w-65 text-xs">
                        {card.description}
                      </p>
                    </div>
                  </div>
                  <ArrowRight
                    className={`text-muted-foreground h-5 w-5 transition-all group-hover:translate-x-1 ${card.arrowClassName}`}
                  />
                </motion.button>
              )
            })}
          </div>

          <div className="border-border/40 text-muted-foreground/80 flex items-center justify-between border-t pt-4 text-[10px] tracking-wide uppercase">
            <div className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              <span>Multi-Chain yield optimizer</span>
            </div>
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              <span>Secure connection</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
