'use client'

import { useEffect, useState } from 'react'

import {
  RainbowKitProvider,
  type Theme,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { WagmiProvider } from 'wagmi'
import type { Config } from 'wagmi'

import { StellarWalletProvider } from './StellarWalletContext'

const queryClient = new QueryClient()

/**
 * RainbowKit's modal in the app's colors, for the mode the app is in. The base
 * theme follows light/dark; the surfaces and the accent are the app's own
 * tokens — the same ones the Stellar wallet modal uses (StellarWalletContext) —
 * so the EVM and Stellar modals look alike. RainbowKit writes theme values into
 * CSS custom properties, so `var(--…)` resolves against the current mode.
 */
function rainbowKitTheme(mode: 'light' | 'dark'): Theme {
  const base = (mode === 'light' ? lightTheme : darkTheme)({
    accentColor: 'var(--primary)',
    accentColorForeground: 'var(--primary-foreground)',
    borderRadius: 'medium',
  })
  return {
    ...base,
    colors: {
      ...base.colors,
      modalBackground: 'var(--popover)',
      modalText: 'var(--popover-foreground)',
      modalTextSecondary: 'var(--muted-foreground)',
      modalTextDim: 'var(--muted-foreground)',
      modalBorder: 'var(--border)',
      generalBorder: 'var(--border)',
      menuItemBackground: 'var(--accent)',
      actionButtonSecondaryBackground: 'var(--muted)',
      closeButtonBackground: 'var(--muted)',
      closeButton: 'var(--muted-foreground)',
    },
    fonts: { body: 'var(--font-sans)' },
  }
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [config, setConfig] = useState<Config | null>(null)
  const { resolvedTheme } = useTheme()

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
          theme={rainbowKitTheme(resolvedTheme === 'light' ? 'light' : 'dark')}
        >
          <StellarWalletProvider>{children}</StellarWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
