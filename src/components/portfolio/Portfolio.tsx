'use client'

import { useEffect, useMemo } from 'react'

import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
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

  const { rate, loading: conversionLoading } = useCurrency()

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

  const netPosition = portfolioSummary.totalSupplying.value - portfolioSummary.totalBorrowing.value
  const healthRatio =
    portfolioSummary.totalBorrowing.value > 0
      ? (portfolioSummary.totalSupplying.value / portfolioSummary.totalBorrowing.value).toFixed(2)
      : '∞'

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — desktop only */}
      <PortfolioSidebar summary={portfolioSummary} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile summary bar */}
        <div className="md:hidden border-b bg-card/40 px-4 py-3 grid grid-cols-4 gap-2">
          <div>
            <p className="text-2xs text-muted-foreground uppercase tracking-wider mb-0.5">Net</p>
            <p className="font-mono text-sm font-semibold truncate">${netPosition.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-2xs text-muted-foreground uppercase tracking-wider mb-0.5">Supply</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
              <p className="font-mono text-sm font-semibold text-emerald-400 truncate">
                ${portfolioSummary.totalSupplying.value.toFixed(0)}
              </p>
            </div>
          </div>
          <div>
            <p className="text-2xs text-muted-foreground uppercase tracking-wider mb-0.5">Borrow</p>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-rose-400 shrink-0" />
              <p className="font-mono text-sm font-semibold text-rose-400 truncate">
                ${portfolioSummary.totalBorrowing.value.toFixed(0)}
              </p>
            </div>
          </div>
          <div>
            <p className="text-2xs text-muted-foreground uppercase tracking-wider mb-0.5">Health</p>
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-emerald-400 shrink-0" />
              <p className="font-mono text-sm font-semibold text-emerald-400">{healthRatio}</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="supply" className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <TabsList className="bg-muted border-border h-auto w-full justify-start gap-0 rounded-none border-b p-0">
            <TabsTrigger
              value="supply"
              className="data-[state=active]:bg-card data-[state=active]:border-primary text-muted-foreground hover:text-foreground h-auto flex-col items-start rounded-none border-b-2 border-transparent px-4 py-3 md:px-8 md:py-5 transition-colors data-[state=active]:shadow-none cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm md:text-lg font-semibold">
                  <span className="hidden sm:inline">Supplying positions</span>
                  <span className="sm:hidden">Supply</span>
                </span>
                <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                  {supplyData.length}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs font-normal hidden sm:block">
                Your active supply positions across protocols
              </p>
            </TabsTrigger>
            <TabsTrigger
              value="borrow"
              className="data-[state=active]:bg-card data-[state=active]:border-primary text-muted-foreground hover:text-foreground h-auto flex-col items-start rounded-none border-b-2 border-transparent px-4 py-3 md:px-8 md:py-5 transition-colors data-[state=active]:shadow-none cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm md:text-lg font-semibold">
                  <span className="hidden sm:inline">Borrowing positions</span>
                  <span className="sm:hidden">Borrow</span>
                </span>
                <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                  {borrowData.length}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs font-normal hidden sm:block">
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
