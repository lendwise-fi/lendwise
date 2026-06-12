'use client'

import { useEffect, useState } from 'react'

import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import type { Config } from 'wagmi'

import { StellarWalletProvider } from './StellarWalletContext'

const queryClient = new QueryClient()

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [config, setConfig] = useState<Config | null>(null)

  useEffect(() => {
    // Load the config only on the client side to avoid SSR errors
    import('../config/wagmi').then((mod) => {
      setConfig(mod.config)
      setMounted(true)
    })
  }, [])

  if (!mounted || !config) {
    return null
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={darkTheme({
            accentColor: '#3b82f6',
            borderRadius: 'medium',
          })}
        >
          <StellarWalletProvider>{children}</StellarWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
