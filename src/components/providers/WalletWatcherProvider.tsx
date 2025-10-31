'use client'

import { useWalletWatcher } from '@/hooks/useWalletWatcher'

/**
 * Provider component that initializes the wallet watcher
 * This should be placed high in the component tree to ensure
 * wallet changes are detected throughout the application
 */
export function WalletWatcherProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // Initialize the wallet watcher
  useWalletWatcher()

  return <>{children}</>
}
