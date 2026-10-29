'use client'

import { useState } from 'react'

import Image from 'next/image'

import { ArrowRight, Lock, Shield, TrendingUp, Wallet, Zap } from 'lucide-react'
import { motion } from 'motion/react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NetworkFamilySelectorDialog } from '@/components/wallet/NetworkFamilySelectorDialog'
import { useConnectWalletFamily } from '@/hooks/useConnectWalletFamily'

const FEATURES = [
  {
    icon: TrendingUp,
    title: 'Rate tracking',
    description: 'Track current and historical APYs across your positions.',
  },
  {
    icon: Shield,
    title: 'Risk management',
    description: 'Monitor health factors and collateral values in real time.',
  },
  {
    icon: Zap,
    title: 'Optimization',
    description: 'Optimize your positions across lending markets.',
  },
]

interface SupportedWallet {
  name: string
  logo: string
}

/**
 * Logos in public/wallets: RainbowKit's for EVM, Stellar Wallets Kit's for
 * Stellar, Solana wallet-adapter's for Solana.
 */
const SUPPORTED: { family: string; wallets: SupportedWallet[] }[] = [
  {
    family: 'EVM',
    wallets: [
      { name: 'MetaMask', logo: '/wallets/metamask.svg' },
      { name: 'Rabby', logo: '/wallets/rabby.svg' },
      { name: 'Coinbase Wallet', logo: '/wallets/coinbase.svg' },
      { name: 'WalletConnect', logo: '/wallets/walletconnect.svg' },
    ],
  },
  {
    family: 'Stellar',
    wallets: [
      { name: 'Freighter', logo: '/wallets/freighter.png' },
      { name: 'xBull', logo: '/wallets/xbull.png' },
      { name: 'LOBSTR', logo: '/wallets/lobstr.png' },
      { name: 'Albedo', logo: '/wallets/albedo.png' },
    ],
  },
  {
    family: 'Solana',
    wallets: [
      { name: 'Phantom', logo: '/wallets/phantom.svg' },
      { name: 'Solflare', logo: '/wallets/solflare.svg' },
    ],
  },
]

function WalletLogo({ name, logo }: SupportedWallet) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="border-border bg-secondary/30 hover:border-primary/40 focus-visible:border-primary/40 flex size-10 items-center justify-center rounded-lg border transition-colors outline-none"
        >
          <Image
            src={logo}
            alt={name}
            width={26}
            height={26}
            unoptimized
            className="rounded-md"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  )
}

export function WalletNotConnected() {
  const [showNetworkDialog, setShowNetworkDialog] = useState(false)

  const connectWalletFamily = useConnectWalletFamily()

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 py-6">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-primary/5 absolute top-1/2 left-1/2 h-150 w-150 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
        <div className="bg-accent/5 absolute top-1/3 left-1/3 h-75 w-75 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-7">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-5 text-center"
        >
          {/* Icon ring */}
          <div className="relative">
            <div className="border-primary/20 bg-primary/10 flex h-20 w-20 items-center justify-center rounded-2xl border">
              <Wallet className="text-primary h-9 w-9" />
            </div>
            <div className="border-border bg-card absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border">
              <Lock className="text-muted-foreground h-2.5 w-2.5" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight">
              Connect your wallet
            </h1>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
              Analyze, track and optimize your positions in one place.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNetworkDialog(true)}
            className="group bg-primary text-primary-foreground shadow-primary/20 hover:bg-primary/90 inline-flex cursor-pointer items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-semibold shadow-lg transition-all"
          >
            <Wallet className="h-4 w-4" />
            Connect Wallet
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* Supported wallets */}
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <span className="text-muted-foreground text-xs tracking-wider uppercase">
              Supports
            </span>
            {SUPPORTED.map((group, i) => (
              <div
                key={group.family}
                role="group"
                aria-label={`${group.family} wallets`}
                className="flex items-center gap-2"
              >
                {i > 0 && (
                  <span
                    className="bg-border mr-1 hidden h-5 w-px sm:block"
                    aria-hidden
                  />
                )}
                {group.wallets.map((w) => (
                  <WalletLogo key={w.name} {...w} />
                ))}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Divider */}
        <div className="flex w-full items-center gap-4">
          <div className="bg-border/50 h-px flex-1" />
          <span className="text-muted-foreground text-xs tracking-wider uppercase">
            What you will unlock
          </span>
          <div className="bg-border/50 h-px flex-1" />
        </div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group border-border/60 bg-card hover:border-primary/25 hover:bg-card/80 flex flex-col gap-3 rounded-2xl border p-5 transition-all"
            >
              <div className="bg-primary/10 group-hover:bg-primary/15 flex h-9 w-9 items-center justify-center rounded-lg transition-colors">
                <f.icon
                  style={{ width: '1.05rem', height: '1.05rem' }}
                  className="text-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-foreground text-xs font-semibold">
                  {f.title}
                </span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {f.description}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      <NetworkFamilySelectorDialog
        open={showNetworkDialog}
        onOpenChange={setShowNetworkDialog}
        onSelect={connectWalletFamily}
      />
    </div>
  )
}
