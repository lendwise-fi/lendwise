'use client'

import { useEffect, useMemo } from 'react'

import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
import { useAccount } from 'wagmi'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WalletNotConnected } from '@/components/wallet'
import { protocolVersionName } from '@/config/protocols-meta'
import { useCurrency } from '@/contexts'
import { useLoadUserPortfolio } from '@/hooks/useLoadUserPortfolio'
import type { PortfolioWalletInput } from '@/lib/portfolio/types'
import {
  attachRisk,
  networkName,
  orphanRiskRows,
  positionValueSummary,
  reportedHealthFactors,
  topWalletSlices,
  walletBalanceBreakdown,
  walletBalanceRows,
} from '@/lib/portfolio/view'
import { summarizeHealth } from '@/lib/risk/summary'
import { useWalletStore } from '@/stores/walletStore'

import { BorrowingTable, SupplyingTable, WalletBalancesTable } from '.'
import { HealthSummaryValue } from './HealthFactorValue'
import { PartialDataBanner } from './PartialDataBanner'
import PortfolioSidebar from './PortfolioSidebar'
import { PortfolioSkeleton } from './PortfolioSkeleton'

/** Quiet time before the wallet list is considered settled. */
const PORTFOLIO_LOAD_DEBOUNCE_MS = 500

export function Portfolio() {
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount()
  const { wallets } = useWalletStore()

  // Derive unified connection state across chain families
  const activeStellarWallet = useMemo(
    () =>
      wallets.find(
        (w) => w.chainFamily === 'stellar' && w.isConnected && w.isActive
      ),
    [wallets]
  )
  const isConnected = isEvmConnected || !!activeStellarWallet

  const { rate, loading: conversionLoading } = useCurrency()

  // Every tracked wallet, as before, now tagged with its chain family; the
  // connected wagmi account is added when the store does not hold it yet.
  const walletsKey = [
    ...wallets
      .filter((w) => w.chainFamily === 'evm' || w.chainFamily === 'stellar')
      .map((w) => `${w.chainFamily}:${w.address}`),
    isEvmConnected && evmAddress ? `evm:${evmAddress}` : '',
  ].join('|')

  const portfolioWallets = useMemo<PortfolioWalletInput[]>(
    () =>
      walletsKey
        .split('|')
        .filter(Boolean)
        .map((entry) => {
          const [chainFamily, address] = entry.split(':')
          return {
            chainFamily: chainFamily as PortfolioWalletInput['chainFamily'],
            address,
          }
        }),
    [walletsKey]
  )

  const { portfolio, fetchPortfolio, isPending, error } =
    useLoadUserPortfolio(portfolioWallets)
  const userPositions = portfolio.positions

  // The wallet list settles over the first second (store hydration, wallet
  // reconnect, Stellar session restore): load once it stops changing, not on
  // every step — each load reads 16 chains.
  useEffect(() => {
    if (portfolioWallets.length === 0) return
    const timer = setTimeout(fetchPortfolio, PORTFOLIO_LOAD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [portfolioWallets, fetchPortfolio])

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

    const totalSupplying = positionValueSummary(
      supplyPositions.map((p) => p.assetAmountUsd)
    )
    const totalBorrowing = positionValueSummary(
      borrowPositions.map((p) => p.loanAssetAmountUsd)
    )
    const totalSupplyingValue = totalSupplying.value
    const totalBorrowingValue = totalBorrowing.value

    const supplyBreakdown = Object.entries(userPositions.supply)
      .filter(([, positions]) => positions.length > 0)
      .map(([protocol, positions], idx) => {
        const total =
          positionValueSummary(positions.map((p) => p.assetAmountUsd)).value ??
          0
        return {
          name: protocolVersionName(protocol),
          value:
            totalSupplyingValue != null && totalSupplyingValue > 0
              ? (total / totalSupplyingValue) * 100
              : 0,
          color: PROTOCOL_COLORS[idx % PROTOCOL_COLORS.length],
        }
      })

    const borrowBreakdown = Object.entries(userPositions.borrow)
      .filter(([, positions]) => positions.length > 0)
      .map(([protocol, positions], idx) => {
        const total =
          positionValueSummary(positions.map((p) => p.loanAssetAmountUsd))
            .value ?? 0
        return {
          name: protocolVersionName(protocol),
          value:
            totalBorrowingValue != null && totalBorrowingValue > 0
              ? (total / totalBorrowingValue) * 100
              : 0,
          color: PROTOCOL_COLORS[idx % PROTOCOL_COLORS.length],
        }
      })

    return {
      totalSupplying: {
        currency: 'USD',
        ...totalSupplying,
        value: totalSupplyingValue == null ? null : totalSupplyingValue * rate,
      },
      totalBorrowing: {
        currency: 'USD',
        ...totalBorrowing,
        value: totalBorrowingValue == null ? null : totalBorrowingValue * rate,
      },
      supplyBreakdown: supplyBreakdown.filter((p) => p.value > 0),
      borrowBreakdown: borrowBreakdown.filter((p) => p.value > 0),
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
  const borrowData = attachRisk(
    Object.values(userPositions.borrow).flat(),
    portfolio.riskAccounts
  )
  const health = summarizeHealth(
    portfolio.riskAccounts,
    reportedHealthFactors(borrowData),
    orphanRiskRows(borrowData, portfolio.riskAccounts)
  )

  const walletData = walletBalanceRows(portfolio.holdings)
  const walletBreakdown = walletBalanceBreakdown(walletData)
  const walletBalances = {
    totalUsd:
      walletBreakdown.totalUsd === null
        ? null
        : walletBreakdown.totalUsd * rate,
    count: walletData.length,
    unpriced: walletBreakdown.unpriced,
    breakdown: topWalletSlices(walletBreakdown.slices).map((slice, idx) => ({
      name: networkName(slice.network),
      value: slice.share,
      color: PROTOCOL_COLORS[idx % PROTOCOL_COLORS.length],
    })),
  }

  const unpriced =
    portfolioSummary.totalSupplying.unpriced +
    portfolioSummary.totalBorrowing.unpriced
  const netPosition =
    portfolioSummary.totalSupplying.value == null ||
    portfolioSummary.totalBorrowing.value == null
      ? null
      : portfolioSummary.totalSupplying.value -
        portfolioSummary.totalBorrowing.value

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — desktop only */}
      <PortfolioSidebar
        summary={portfolioSummary}
        health={health}
        walletBalances={walletBalances}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile summary bar */}
        <div className="bg-card/40 grid grid-cols-4 gap-2 border-b px-4 py-3 md:hidden">
          <div>
            <p className="text-2xs text-muted-foreground mb-0.5 tracking-wider uppercase">
              {unpriced > 0 ? 'Priced net' : 'Net'}
            </p>
            <p className="truncate font-mono text-sm font-semibold">
              {netPosition == null ? '—' : `$${netPosition.toFixed(0)}`}
            </p>
          </div>
          <div>
            <p className="text-2xs text-muted-foreground mb-0.5 tracking-wider uppercase">
              Supply
            </p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 shrink-0 text-emerald-400" />
              <p className="truncate font-mono text-sm font-semibold text-emerald-400">
                {portfolioSummary.totalSupplying.value == null
                  ? '—'
                  : `$${portfolioSummary.totalSupplying.value.toFixed(0)}`}
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
                {portfolioSummary.totalBorrowing.value == null
                  ? '—'
                  : `$${portfolioSummary.totalBorrowing.value.toFixed(0)}`}
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
                <HealthSummaryValue summary={health} />
              </p>
            </div>
          </div>
        </div>

        {unpriced > 0 && (
          <p className="text-muted-foreground border-b px-4 py-2 text-xs">
            {unpriced} unpriced {unpriced === 1 ? 'position' : 'positions'}{' '}
            excluded from totals.
          </p>
        )}
        <PartialDataBanner failures={portfolio.failures} />

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
            <TabsTrigger
              value="wallet"
              className="data-[state=active]:bg-card data-[state=active]:border-primary text-muted-foreground hover:text-foreground h-auto cursor-pointer flex-col items-start rounded-none border-b-2 border-transparent px-4 py-3 transition-colors data-[state=active]:shadow-none md:px-8 md:py-5"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm font-semibold md:text-lg">
                  <span className="hidden sm:inline">Wallet balances</span>
                  <span className="sm:hidden">Wallet</span>
                </span>
                <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                  {walletData.length}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 hidden text-xs font-normal sm:block">
                Assets held in your wallets, not supplied or borrowed
              </p>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="supply" className="mt-0 flex-1 overflow-y-auto">
            <SupplyingTable data={supplyData} />
          </TabsContent>
          <TabsContent value="borrow" className="mt-0 flex-1 overflow-y-auto">
            <BorrowingTable data={borrowData} />
          </TabsContent>
          <TabsContent value="wallet" className="mt-0 flex-1 overflow-y-auto">
            <WalletBalancesTable data={walletData} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
