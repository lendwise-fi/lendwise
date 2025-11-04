'use client'

import { useEffect, useMemo } from 'react'

import { useAccount } from 'wagmi'

import {
  PieChartDonutText,
  PieChartDonutTextProps,
  PieChartDonutTextSkeleton,
} from '@/components/charts'
import { DataTableSkeleton } from '@/components/table'
import { WalletNotConnected } from '@/components/wallet'
// import { useCryptoPrices } from '@/hooks/useCryptoPrices'
import { useLoadUserPositions } from '@/hooks/useLoadUserPositions'

// import {
//   getUniqueCoinGeckoIds,
//   mapCurrencyToCoinGecko,
// } from '@/lib/crypto-mapping'
// import { useWalletStore } from '@/stores/walletStore'
// import { BorrowPosition, LendPosition } from '@/types'

import { BorrowingTable, LendingTable } from '.'

export function Portfolio() {
  const { address, isConnected } = useAccount()
  // const { baseCurrency } = useWalletStore()

  // Memoize addresses array to prevent unnecessary re-renders
  const addresses = useMemo(() => (address ? [address] : []), [address])

  const { userPositions, fetchUserPositions, isPending, error } =
    useLoadUserPositions(addresses)

  // Get all unique asset symbols from positions
  // const assetSymbols = useMemo(() => {
  //   const symbols = new Set<string>()

  //   const allPositions = [
  //     ...Object.values(userPositions.lend).flat(),
  //     ...Object.values(userPositions.borrow).flat(),
  //   ]

  //   allPositions.forEach((position: LendPosition | BorrowPosition) => {
  //     if ('assetSymbol' in position) {
  //       symbols.add(position.assetSymbol)
  //     }
  //     if ('collateralAssetSymbol' in position) {
  //       symbols.add(position.collateralAssetSymbol ?? '')
  //     }
  //     if ('loanAssetSymbol' in position) {
  //       symbols.add(position.loanAssetSymbol ?? '')
  //     }
  //   })

  //   return Array.from(symbols)
  // }, [userPositions])

  // Get CoinGecko IDs for all assets
  // const coinIds = useMemo(
  //   () => getUniqueCoinGeckoIds(assetSymbols),
  //   [assetSymbols]
  // )

  // Fetch prices for all assets in the selected currency
  // const targetCurrency = mapCurrencyToCoinGecko(baseCurrency)
  // const { prices, loading: pricesLoading } = useCryptoPrices(
  //   coinIds,
  //   targetCurrency as any
  // )

  useEffect(() => {
    if (address) {
      fetchUserPositions()
    }
  }, [address])

  const lendPieChartDonut = useMemo(() => {
    const chart: PieChartDonutTextProps = {
      data: [],
      config: {},
    }

    let nbPositions = 0
    const totalByProtocol: number[] = []

    Object.keys(userPositions.lend).map((protocol, idx) => {
      const total = userPositions.lend[protocol].reduce(
        (acc, val) => acc + Number(val.assetAmountUsd),
        0
      )
      totalByProtocol.push(total)
      nbPositions += userPositions.lend[protocol].length
      chart.data.push({
        label: protocol,
        value: Number(total),
        fill: `var(--color-${protocol})`,
      })
      chart.config[protocol] = {
        label: protocol,
        color: `var(--chart-${++idx})`,
      }
    })

    const total = totalByProtocol.reduce((acc, val) => acc + val, 0)
    chart.data.forEach((item) => {
      item.percent = (item.value / total) * 100
    })

    chart['title'] = 'Total Lending'
    chart['description'] =
      `${nbPositions} position${nbPositions > 1 ? 's' : ''}`

    return chart
  }, [userPositions])

  const borrowPieChartDonut = useMemo(() => {
    const chart: PieChartDonutTextProps = {
      data: [],
      config: {},
    }

    let nbPositions = 0
    const totalByProtocol: number[] = []

    Object.keys(userPositions.borrow).map((protocol, idx) => {
      const total = userPositions.borrow[protocol].reduce(
        (acc, val) => acc + Number(val.loanAssetAmountUsd),
        0
      )
      totalByProtocol.push(total)
      nbPositions += userPositions.borrow[protocol].length
      chart.data.push({
        label: protocol,
        value: Number(total),
        fill: `var(--color-${protocol})`,
      })
      chart.config[protocol] = {
        label: protocol,
        color: `var(--chart-${++idx})`,
      }
    })

    const total = totalByProtocol.reduce((acc, val) => acc + val, 0)
    chart.data.forEach((item) => {
      item.percent = (item.value / total) * 100
    })

    chart['title'] = 'Total Borrowing'
    chart['description'] =
      `${nbPositions} position${nbPositions > 1 ? 's' : ''}`

    return chart
  }, [userPositions])

  if (error) return <p>{error}</p>

  if (!isConnected) {
    return <WalletNotConnected />
  }

  return (
    <div>
      <div className="flex-1 space-y-8 p-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-foreground mb-2 text-3xl font-bold">
              Portfolio Tracker
            </h1>
            <p className="text-muted-foreground-400">
              Monitor all your DeFi positions across protocols and chains
            </p>
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {isPending ? (
            <>
              <PieChartDonutTextSkeleton />
              <PieChartDonutTextSkeleton />
            </>
          ) : (
            <>
              <PieChartDonutText
                title={lendPieChartDonut.title}
                description={lendPieChartDonut.description}
                data={lendPieChartDonut.data}
                config={lendPieChartDonut.config}
              />
              <PieChartDonutText
                title={borrowPieChartDonut.title}
                description={borrowPieChartDonut.description}
                data={borrowPieChartDonut.data}
                config={borrowPieChartDonut.config}
              />
            </>
          )}
        </div>

        {/* Detailed Positions Lists */}
        {isPending ? (
          <div className="space-y-8">
            <DataTableSkeleton />
            <DataTableSkeleton />
          </div>
        ) : (
          <div className="mt-16 space-y-28">
            <LendingTable data={Object.values(userPositions.lend).flat()} />
            <BorrowingTable data={Object.values(userPositions.borrow).flat()} />
          </div>
        )}
      </div>
    </div>
  )
}
