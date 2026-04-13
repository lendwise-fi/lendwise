'use client'

import { useState } from 'react'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ArrowRight, Lock, Shield, TrendingUp, Wallet, Zap } from 'lucide-react'
import { motion } from 'motion/react'

const FEATURES = [
  {
    icon: TrendingUp,
    title: 'Yield optimization',
    description: 'Access AI-powered strategies to maximize your returns across protocols.',
  },
  {
    icon: Shield,
    title: 'Risk management',
    description: 'Monitor health ratios and collateral in real-time across all your positions.',
  },
  {
    icon: Zap,
    title: 'One-click rebalancing',
    description: 'Rebalance your portfolio instantly with automated liquidity routing.',
  },
]

const SUPPORTED = ['MetaMask', 'WalletConnect', 'Coinbase', 'Rabby']

export function WalletNotConnected() {
  const [hoveredWallet, setHoveredWallet] = useState<string | null>(null)

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16 min-h-[calc(100vh-4rem)]">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-1/3 left-1/3 h-[300px] w-[300px] rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-12">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-5 text-center"
        >
          {/* Icon ring */}
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Wallet className="h-9 w-9 text-primary" />
            </div>
            <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card">
              <Lock className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Connect your wallet
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              View your positions, track yields and optimize your DeFi portfolio in one place.
            </p>
          </div>

          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => {
              if (!mounted) return null
              return (
                <button
                  onClick={openConnectModal}
                  className="group inline-flex items-center gap-2.5 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                >
                  <Wallet className="h-4 w-4" />
                  Connect wallet
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              )
            }}
          </ConnectButton.Custom>

          {/* Supported wallets */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Supports</span>
            {SUPPORTED.map((w) => (
              <span
                key={w}
                onMouseEnter={() => setHoveredWallet(w)}
                onMouseLeave={() => setHoveredWallet(null)}
                className={`cursor-default rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  hoveredWallet === w
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border bg-secondary/30 text-muted-foreground'
                }`}
              >
                {w}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Divider */}
        <div className="flex w-full items-center gap-4">
          <div className="h-px flex-1 bg-border/50" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            What you'll unlock
          </span>
          <div className="h-px flex-1 bg-border/50" />
        </div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3"
        >
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="group flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5 transition-all hover:border-primary/25 hover:bg-card/80"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
                <f.icon style={{ width: '1.05rem', height: '1.05rem' }} className="text-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-foreground">{f.title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{f.description}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
