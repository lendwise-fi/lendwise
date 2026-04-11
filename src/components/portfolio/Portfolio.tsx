'use client'

import { useEffect, useMemo } from 'react'

import { Address } from 'viem'
import { useAccount } from 'wagmi'

import { PortfolioSkeleton } from './PortfolioSkeleton'
import { WalletNotConnected } from '@/components/wallet'
import { getProtocolVersionNameById } from '@/config'
import { useCurrency } from '@/contexts'
import { useLoadUserPositions } from '@/hooks/useLoadUserPositions'
import { useWalletStore } from '@/stores/walletStore'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

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

  if (isPending || conversionLoading) {
    return <PortfolioSkeleton />
  }

  const supplyData = Object.values(userPositions.supply).flat()
  const borrowData = Object.values(userPositions.borrow).flat()

  return (
    <div className="flex h-full overflow-hidden">
      <PortfolioSidebar summary={portfolioSummary} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Tabs defaultValue="supply" className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <TabsList className="bg-muted border-border h-auto w-full justify-start gap-0 rounded-none border-b p-0">
            <TabsTrigger
              value="supply"
              className="data-[state=active]:bg-card data-[state=active]:border-primary text-muted-foreground hover:text-foreground h-auto flex-col items-start rounded-none border-b-2 border-transparent px-8 py-5 transition-colors data-[state=active]:shadow-none cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-foreground text-lg font-semibold">Supplying positions</span>
                <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {supplyData.length}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-[12px] font-normal">
                Your active supply positions across protocols
              </p>
            </TabsTrigger>
            <TabsTrigger
              value="borrow"
              className="data-[state=active]:bg-card data-[state=active]:border-primary text-muted-foreground hover:text-foreground h-auto flex-col items-start rounded-none border-b-2 border-transparent px-8 py-5 transition-colors data-[state=active]:shadow-none cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-foreground text-lg font-semibold">Borrowing positions</span>
                <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {borrowData.length}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-[12px] font-normal">
                Active loans and collateral positions
              </p>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="supply" className="mt-0 flex-1 overflow-y-auto">
            <SupplyingTable data={supplyData} />
          </TabsContent>
          <TabsContent value="borrow" className="mt-0 flex-1 overflow-y-auto">
            <BorrowingTable data={borrowData} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
