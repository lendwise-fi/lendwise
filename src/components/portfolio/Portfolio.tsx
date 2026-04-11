'use client'

import { useEffect, useMemo } from 'react'

import { Address } from 'viem'
import { useAccount } from 'wagmi'

import { DataTableSkeleton } from '@/components/table'
import { WalletNotConnected } from '@/components/wallet'
import { getProtocolVersionNameById } from '@/config'
import { useCurrency } from '@/contexts'
import { useLoadUserPositions } from '@/hooks/useLoadUserPositions'
import { useWalletStore } from '@/stores/walletStore'

import { BorrowingTable, SupplyingTable } from '.'
import PortfolioSidebar from './PortfolioSidebar'

export function Portfolio() {
  const { address, isConnected } = useAccount()
  const { wallets } = useWalletStore()

  // Get currency context
  const { rate, loading: conversionLoading } = useCurrency()

  // Memoize addresses array to prevent unnecessary re-renders
  const addresses = useMemo(
    () => wallets.map((wallet) => wallet.address as Address),
    [wallets]
  )

  const { userPositions, fetchUserPositions, isPending, error } =
    useLoadUserPositions(addresses)

  useEffect(() => {
    if (address) {
      fetchUserPositions()
    }
  }, [address])

  const PROTOCOL_COLORS = [
    '#06B6D4',
    '#8B5CF6',
    '#F59E0B',
    '#10B981',
    '#EF4444',
    '#3B82F6',
  ]

  const portfolioSummary = useMemo(() => {
    const supplyPositions = Object.values(userPositions.supply).flat()
    const borrowPositions = Object.values(userPositions.borrow).flat()

    const totalSupplyingValue = supplyPositions.reduce(
      (acc, p) => acc + Number(p.assetAmountUsd) * rate,
      0
    )
    const totalBorrowingValue = borrowPositions.reduce(
      (acc, p) => acc + Number(p.loanAssetAmountUsd) * rate,
      0
    )

    const supplyBreakdown = Object.entries(userPositions.supply)
      .filter(([, positions]) => positions.length > 0)
      .map(([protocol, positions], idx) => {
        const total = positions.reduce(
          (acc, p) => acc + Number(p.assetAmountUsd) * rate,
          0
        )
        return {
          name: getProtocolVersionNameById(protocol),
          value: totalSupplyingValue > 0 ? (total / totalSupplyingValue) * 100 : 0,
          color: PROTOCOL_COLORS[idx % PROTOCOL_COLORS.length],
        }
      })

    const borrowBreakdown = Object.entries(userPositions.borrow)
      .filter(([, positions]) => positions.length > 0)
      .map(([protocol, positions], idx) => {
        const total = positions.reduce(
          (acc, p) => acc + Number(p.loanAssetAmountUsd) * rate,
          0
        )
        return {
          name: getProtocolVersionNameById(protocol),
          value: totalBorrowingValue > 0 ? (total / totalBorrowingValue) * 100 : 0,
          color: PROTOCOL_COLORS[idx % PROTOCOL_COLORS.length],
        }
      })

    return {
      totalSupplying: {
        value: totalSupplyingValue,
        currency: 'USD',
        positions: supplyPositions.length,
      },
      totalBorrowing: {
        value: totalBorrowingValue,
        currency: 'USD',
        positions: borrowPositions.length,
      },
      supplyBreakdown,
      borrowBreakdown,
    }
  }, [userPositions, rate])

  if (error) return <p>{error}</p>

  if (!isConnected) {
    return <WalletNotConnected />
  }

  return (
    <div className="flex h-full overflow-hidden">
      <PortfolioSidebar summary={portfolioSummary} />

      {/* Right: positions */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isPending || conversionLoading ? (
          <div className="space-y-6">
            <DataTableSkeleton />
            <DataTableSkeleton />
          </div>
        ) : (
          <div className="space-y-10">
            <SupplyingTable data={Object.values(userPositions.supply).flat()} />
            <BorrowingTable data={Object.values(userPositions.borrow).flat()} />
          </div>
        )}
      </div>
    </div>
  )
}
