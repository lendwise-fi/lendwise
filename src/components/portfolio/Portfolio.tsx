'use client'

import { useEffect, useMemo } from 'react'

import { Address } from 'viem'
import { useAccount } from 'wagmi'

import {
  PieChartDonutText,
  PieChartDonutTextProps,
  PieChartDonutTextSkeleton,
} from '@/components/charts'
import { DataTableSkeleton } from '@/components/table'
import { WalletNotConnected } from '@/components/wallet'
import { getProtocolVersionNameById } from '@/config'
import { useCurrency } from '@/contexts'
import { useLoadUserPositions } from '@/hooks/useLoadUserPositions'
import { useWalletStore } from '@/stores/walletStore'

import { BorrowingTable, LendingTable } from '.'

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

  const lendPieChartDonut = useMemo(() => {
    const chart: PieChartDonutTextProps = {
      data: [],
      config: {},
    }

    let nbPositions = 0
    const totalByProtocol: number[] = []

    Object.keys(userPositions.lend).map((protocol, idx) => {
      if (!userPositions.lend[protocol].length) return
      const total = userPositions.lend[protocol].reduce(
        (acc, val) => acc + Number(val.assetAmountUsd) * rate,
        0
      )
      totalByProtocol.push(total)
      nbPositions += userPositions.lend[protocol].length
      const protocolName = getProtocolVersionNameById(protocol)
      chart.data.push({
        id: protocol,
        label: protocolName,
        value: Number(total),
        fill: `var(--color-${protocol})`,
      })
      chart.config[protocol] = {
        label: protocolName,
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
  }, [userPositions, rate])

  const borrowPieChartDonut = useMemo(() => {
    const chart: PieChartDonutTextProps = {
      data: [],
      config: {},
    }

    let nbPositions = 0
    const totalByProtocol: number[] = []

    Object.keys(userPositions.borrow).map((protocol, idx) => {
      if (!userPositions.borrow[protocol].length) return
      const total = userPositions.borrow[protocol].reduce(
        (acc, val) => acc + Number(val.loanAssetAmountUsd) * rate,
        0
      )
      totalByProtocol.push(total)
      nbPositions += userPositions.borrow[protocol].length
      const protocolName = getProtocolVersionNameById(protocol)
      chart.data.push({
        id: protocol,
        label: protocolName,
        value: Number(total),
        fill: `var(--color-${protocol})`,
      })
      chart.config[protocol] = {
        label: protocolName,
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
  }, [userPositions, rate])

  if (error) return <p>{error}</p>

  if (!isConnected) {
    return <WalletNotConnected />
  }

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-foreground mb-2 text-2xl md:text-3xl font-bold">
            Portfolio Tracker
          </h1>
          <p className="text-muted-foreground-400 text-sm md:text-base">
            Monitor all your DeFi positions across protocols and chains
          </p>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 md:grid-cols-2">
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
      {isPending || conversionLoading ? (
        <div className="space-y-6 md:space-y-8">
          <DataTableSkeleton />
          <DataTableSkeleton />
        </div>
      ) : (
        <div className="mt-8 md:mt-12 space-y-8 md:space-y-12">
          <LendingTable data={Object.values(userPositions.lend).flat()} />
          <BorrowingTable data={Object.values(userPositions.borrow).flat()} />
        </div>
      )}
    </div>
  )
}
