'use client'

import { useEffect, useMemo } from 'react'

import { Activity, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import { useAccount } from 'wagmi'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WalletNotConnected } from '@/components/wallet'
import { protocolVersionName } from '@/config/protocols-meta'
import { useCurrency } from '@/contexts'
import { useLoadUserPositions } from '@/hooks/useLoadUserPositions'
import type { PortfolioWalletInput } from '@/lib/portfolio/types'
import { healthFactorFromBorrowPositions } from '@/lib/risk/portfolio-health'
import { useWalletStore } from '@/stores/walletStore'

import { BorrowingTable, SupplyingTable } from '.'
import PortfolioSidebar from './PortfolioSidebar'
import { PortfolioSkeleton } from './PortfolioSkeleton'

export function Portfolio() {
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount()
  const { wallets } = useWalletStore()

  const { rate, loading: conversionLoading } = useCurrency()

  const portfolioWallets = useMemo<PortfolioWalletInput[]>(() => {
    const connected: PortfolioWalletInput[] = []

    for (const wallet of wallets) {
      if (!wallet.isConnected) continue
      if (wallet.chainFamily !== 'evm' && wallet.chainFamily !== 'stellar') {
        continue
      }
      connected.push({
        address: wallet.address,
        chainFamily: wallet.chainFamily,
      })
    }

    if (
      isEvmConnected &&
      evmAddress &&
      !connected.some(
        (wallet) => wallet.address.toLowerCase() === evmAddress.toLowerCase()
      )
    ) {
      connected.push({ address: evmAddress, chainFamily: 'evm' })
    }

    return connected
  }, [evmAddress, isEvmConnected, wallets])

  const isConnected = portfolioWallets.length > 0

  const {
    userPositions,
    fetchUserPositions,
    isPending,
    error,
    partialFailures,
  } = useLoadUserPositions(portfolioWallets)

  useEffect(() => {
    if (portfolioWallets.length > 0) {
      fetchUserPositions()
    }
  }, [fetchUserPositions, portfolioWallets])

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
          name: protocolVersionName(protocol),
          value:
            totalSupplyingValue > 0 ? (total / totalSupplyingValue) * 100 : 0,
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
          name: protocolVersionName(protocol),
          value:
            totalBorrowingValue > 0 ? (total / totalBorrowingValue) * 100 : 0,
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

  const netPosition =
    portfolioSummary.totalSupplying.value -
    portfolioSummary.totalBorrowing.value
  const healthFactor = healthFactorFromBorrowPositions(borrowData)
  const healthRatio = formatHealthFactor(healthFactor)
  const hasUnknownRisk = healthFactor.status === 'unknown'

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — desktop only */}
      <PortfolioSidebar
        summary={portfolioSummary}
        healthFactor={healthFactor}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {partialFailures.length > 0 ? (
          <div className="border-border flex items-start gap-2 border-b bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Partial data:{' '}
              {partialFailures
                .map((f) => f.protocolId ?? f.chainFamily)
                .join(', ')}{' '}
              temporarily unavailable.
            </span>
          </div>
        ) : null}

        {hasUnknownRisk ? (
          <div className="border-border flex items-start gap-2 border-b bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Risk and valuation incomplete: a reserve price or risk parameter
              is missing, so health is shown as unknown.
            </span>
          </div>
        ) : null}

        {/* Mobile summary bar */}
        <div className="bg-card/40 grid grid-cols-4 gap-2 border-b px-4 py-3 md:hidden">
          <div>
            <p className="text-2xs text-muted-foreground mb-0.5 tracking-wider uppercase">
              Net
            </p>
            <p className="truncate font-mono text-sm font-semibold">
              ${netPosition.toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-2xs text-muted-foreground mb-0.5 tracking-wider uppercase">
              Supply
            </p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 shrink-0 text-emerald-400" />
              <p className="truncate font-mono text-sm font-semibold text-emerald-400">
                ${portfolioSummary.totalSupplying.value.toFixed(0)}
              </p>
            </div>
          </div>
          <div>
            <p className="text-2xs text-muted-foreground mb-0.5 tracking-wider uppercase">
              Borrow
            </p>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3 shrink-0 text-rose-400" />
              <p className="truncate font-mono text-sm font-semibold text-rose-400">
                ${portfolioSummary.totalBorrowing.value.toFixed(0)}
              </p>
            </div>
          </div>
          <div>
            <p className="text-2xs text-muted-foreground mb-0.5 tracking-wider uppercase">
              Health
            </p>
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 shrink-0 text-emerald-400" />
              <p className="font-mono text-sm font-semibold text-emerald-400">
                {healthRatio}
              </p>
            </div>
          </div>
        </div>

        <Tabs
          defaultValue="supply"
          className="flex flex-1 flex-col overflow-hidden"
        >
          {/* Tab bar */}
          <TabsList className="bg-muted border-border h-auto w-full justify-start gap-0 rounded-none border-b p-0">
            <TabsTrigger
              value="supply"
              className="data-[state=active]:bg-card data-[state=active]:border-primary text-muted-foreground hover:text-foreground h-auto cursor-pointer flex-col items-start rounded-none border-b-2 border-transparent px-4 py-3 transition-colors data-[state=active]:shadow-none md:px-8 md:py-5"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm font-semibold md:text-lg">
                  <span className="hidden sm:inline">Supplying positions</span>
                  <span className="sm:hidden">Supply</span>
                </span>
                <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                  {supplyData.length}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 hidden text-xs font-normal sm:block">
                Your active supply positions across protocols
              </p>
            </TabsTrigger>
            <TabsTrigger
              value="borrow"
              className="data-[state=active]:bg-card data-[state=active]:border-primary text-muted-foreground hover:text-foreground h-auto cursor-pointer flex-col items-start rounded-none border-b-2 border-transparent px-4 py-3 transition-colors data-[state=active]:shadow-none md:px-8 md:py-5"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm font-semibold md:text-lg">
                  <span className="hidden sm:inline">Borrowing positions</span>
                  <span className="sm:hidden">Borrow</span>
                </span>
                <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                  {borrowData.length}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 hidden text-xs font-normal sm:block">
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

function formatHealthFactor(
  result: ReturnType<typeof healthFactorFromBorrowPositions>
) {
  if (result.status === 'unknown') return 'Unknown'
  if (result.status === 'no-liability') return '∞'
  return result.healthFactor.toFixed(2)
}
