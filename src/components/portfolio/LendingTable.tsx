'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'

import { ColumnDef } from '@tanstack/react-table'
import { AlertCircle, ArrowUpRightFromSquare, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { loadMarketLendHistoryRates } from '@/app/actions'
import { ChainBadge } from '@/components/badge/ChainBadge'
import { ProtocolBadge } from '@/components/badge/ProtocolBadge'
import { ChainIcon, ProtocolIcon, TokenIcon } from '@/components/icon'
import {
  DataTable,
  SortableHeader,
  getUniqueColumnValues,
} from '@/components/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { WalletAvatar } from '@/components/wallet/WalletAvatar'
import { getProtocolVersionNameById } from '@/config/protocols'
import { useCurrency } from '@/contexts'
import { useIsMobile } from '@/hooks/useMobile'
import { formatCompactCurrency } from '@/lib/format-currency'
import { formatAddress } from '@/lib/utils'
import {
  LendPosition,
  MarketRate,
  TIMEFRAME_OPTIONS,
  TimeframeLabel,
} from '@/types'

import { AddressBadge } from '../badge/AddressBadge'

const createColumns = (
  currency: string,
  rate: number,
  _isMobile: boolean
): ColumnDef<LendPosition>[] => [
  {
    accessorKey: 'protocol',
    header: 'Protocol',
    size: 110,
    minSize: 110,
    cell: ({ row }) => <ProtocolBadge protocol={row.original.protocol} />,
    meta: {
      isMobileHidden: true,
    },
  },
  {
    accessorKey: 'poolChainNetwork',
    header: 'Chain',
    cell: ({ row }) => <ChainBadge chainSlug={row.original.poolChainNetwork} />,
    meta: {
      isMobileHidden: true,
    },
  },
  {
    accessorKey: 'userAddress',
    header: 'Address',
    cell: ({ row }) => <AddressBadge address={row.original.userAddress} />,

    enableHiding: false,
    meta: {
      isMobileHidden: true,
    },
  },
  {
    accessorKey: 'poolName',
    header: 'Vault / Pool',
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-2">
        <TokenIcon symbol={row.original.assetSymbol} />
        <TableCellViewer item={row.original} />
      </div>
    ),
    enableHiding: false,
  },
  {
    header: 'Deposits',
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-3 text-xs">
        {formatCompactCurrency(
          row.original.assetAmount,
          row.original.assetSymbol,
          row.original.assetDecimals
        )}
        <Badge variant="secondary" className="text-xs">
          {formatCompactCurrency(row.original.assetAmountUsd * rate, currency)}
        </Badge>
      </div>
    ),

    enableHiding: false,
  },
  {
    accessorKey: 'apy',
    header: ({ column }) => (
      <SortableHeader column={column}>APY</SortableHeader>
    ),
    size: 60,
    cell: ({ row }) => <span>{Number(row.original.apy).toFixed(2)}%</span>,
    enableHiding: false,
    enableSorting: true,
  },
  {
    id: 'actions',
    size: 80,
    minSize: 80,
    cell: ({ row }) =>
      row.original.link ? (
        <Link
          target="_blank"
          href={row.original.link}
          className="flex w-full items-center justify-center"
        >
          <ArrowUpRightFromSquare size={15} />
        </Link>
      ) : null,
  },
]

const chartConfig = {
  rate: {
    label: 'Rate',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

function TableCellViewer({ item }: { item: LendPosition }) {
  const isMobile = useIsMobile()
  const [rates, setRates] = useState<MarketRate[]>([])
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<TimeframeLabel>('7d')
  const [pending, startTransition] = useTransition()

  const handleLoadRates = async (timeframeLabel: TimeframeLabel) => {
    const option = TIMEFRAME_OPTIONS.find((o) => o.label === timeframeLabel)
    if (!option) return

    startTransition(async () => {
      setSelectedTimeframe(timeframeLabel)

      let fromTimestamp = 0
      if (option.days) {
        const now = Math.floor(Date.now() / 1000)
        fromTimestamp = now - option.days * 24 * 60 * 60
      }

      try {
        const rates = await loadMarketLendHistoryRates({
          protocolId: item.protocol,
          chainId: item.poolChainId,
          poolId: item.poolId,
          tokenId: item.assetAddress,
          interval: option.label,
          fromTimestamp,
        })
        setRates(rates)
      } catch (error) {
        console.error('Failed to load market rates:', error)
      }
    })
  }

  const hasData = rates && rates.length > 0

  return (
    <Drawer direction={isMobile ? 'bottom' : 'right'}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="text-foreground decoration-muted-foreground w-fit cursor-pointer px-0 text-left underline decoration-dashed underline-offset-6"
          onClick={() => {
            handleLoadRates('7d')
          }}
        >
          {item.poolName}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{item.poolName}</DrawerTitle>
          <DrawerDescription asChild>
            <div className="flex flex-wrap gap-2">
              <ProtocolBadge protocol={item.protocol} />
              <ChainBadge chainSlug={item.poolChainNetwork} />
              <AddressBadge address={item.userAddress} noCopy border />
            </div>
          </DrawerDescription>
        </DrawerHeader>
        <Separator className="mb-4" />
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {isMobile ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 leading-none font-medium">
                <div className="flex items-center gap-2">
                  Borrowing rate <TrendingUp className="size-4" />
                </div>
                <div className="flex items-center gap-1">
                  <Select
                    value={selectedTimeframe}
                    onValueChange={(value) =>
                      handleLoadRates(value as TimeframeLabel)
                    }
                  >
                    <SelectTrigger className="h-7 w-[80px] text-xs">
                      <SelectValue placeholder="Select timeframe" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {TIMEFRAME_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.label}
                          value={option.label}
                          className="text-xs"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {pending ? (
                <div className="text-muted-foreground flex aspect-video items-center justify-center text-sm">
                  Loading...
                </div>
              ) : (
                <div className="relative w-full">
                  <ChartContainer
                    config={chartConfig}
                    className="h-full w-full"
                  >
                    <AreaChart
                      accessibilityLayer
                      data={rates}
                      margin={{
                        top: 10,
                        right: -45,
                        left: 0,
                        bottom: 0,
                      }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="timestamp"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        tickFormatter={(value) => {
                          return new Date(value * 1000).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                            }
                          )
                        }}
                      />
                      <YAxis
                        dataKey="rate"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tickMargin={-45}
                        width={50}
                        tick={{
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 11,
                        }}
                        tickFormatter={(value) =>
                          `${Number(value * 100).toFixed(2)}%`
                        }
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="line"
                            labelFormatter={(value) => {
                              return new Date(value * 1000).toLocaleDateString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  ...(selectedTimeframe === '24h' && {
                                    hour: 'numeric',
                                    minute: 'numeric',
                                  }),
                                }
                              )
                            }}
                            valueFormatter={(value) => {
                              return `${(Number(value) * 100).toFixed(2)}%`
                            }}
                          />
                        }
                      />
                      <Area
                        dataKey="rate"
                        type="natural"
                        fill="var(--color-rate)"
                        fillOpacity={0.4}
                        stroke="var(--color-rate)"
                        stackId="a"
                      />
                    </AreaChart>
                  </ChartContainer>
                  {!hasData && (
                    <div className="text-muted-foreground pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-sm">
                      <AlertCircle className="mb-2 h-6 w-6 opacity-40" />
                      <p>No data available</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 leading-none font-medium">
                <div className="flex items-center gap-2">
                  Borrowing rate <TrendingUp className="size-4" />
                </div>
                <div className="flex items-center gap-1">
                  <Select
                    value={selectedTimeframe}
                    onValueChange={(value) =>
                      handleLoadRates(value as TimeframeLabel)
                    }
                  >
                    <SelectTrigger className="h-7 w-[80px] text-xs">
                      <SelectValue placeholder="Select timeframe" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {TIMEFRAME_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.label}
                          value={option.label}
                          className="text-xs"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {pending ? (
                <div className="text-muted-foreground flex aspect-video items-center justify-center text-sm">
                  Loading...
                </div>
              ) : (
                <div className="relative w-full">
                  <ChartContainer
                    config={chartConfig}
                    className="h-full w-full"
                  >
                    <AreaChart
                      accessibilityLayer
                      data={rates}
                      margin={{
                        top: 10,
                        right: -45,
                        left: 0,
                        bottom: 0,
                      }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="timestamp"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        tickFormatter={(value) => {
                          return new Date(value * 1000).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                            }
                          )
                        }}
                      />
                      <YAxis
                        dataKey="rate"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tickMargin={-45}
                        width={50}
                        tick={{
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 11,
                        }}
                        tickFormatter={(value) =>
                          `${Number(value * 100).toFixed(2)}%`
                        }
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="line"
                            labelFormatter={(value) => {
                              return new Date(value * 1000).toLocaleDateString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  ...(selectedTimeframe === '24h' && {
                                    hour: 'numeric',
                                    minute: 'numeric',
                                  }),
                                }
                              )
                            }}
                            valueFormatter={(value) => {
                              return `${(Number(value) * 100).toFixed(2)}%`
                            }}
                          />
                        }
                      />
                      <Area
                        dataKey="rate"
                        type="natural"
                        fill="var(--color-rate)"
                        fillOpacity={0.4}
                        stroke="var(--color-rate)"
                        stackId="a"
                      />
                    </AreaChart>
                  </ChartContainer>
                  {!hasData && (
                    <div className="text-muted-foreground pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-sm">
                      <AlertCircle className="mb-2 h-6 w-6 opacity-40" />
                      <p>No data available</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Done</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function LendingTable({ data }: { data: LendPosition[] }) {
  const { baseCurrency, rate } = useCurrency()
  const isMobile = useIsMobile()
  const columns = createColumns(baseCurrency, rate, isMobile).filter(
    (column) => !isMobile || !column.meta?.isMobileHidden
  )

  return (
    <div>
      <h2 className="text-foreground text-2xl font-semibold">
        Lending positions
      </h2>
      <Separator className="my-3" />
      <DataTable
        columns={columns}
        data={data}
        searchableColumn="poolName"
        initialSorting={[{ id: 'apy', desc: true }]}
        filterableColumns={[
          ...(isMobile
            ? []
            : [
                {
                  column: 'protocol',
                  title: 'Protocol',
                  options: getUniqueColumnValues(data, 'protocol').map(
                    (value) => ({
                      value: value as string,
                      label: (
                        <div className="flex items-center gap-2">
                          <ProtocolIcon protocol={value as string} />{' '}
                          {getProtocolVersionNameById(value)}
                        </div>
                      ),
                    })
                  ),
                },
                {
                  column: 'poolChainNetwork',
                  title: 'Chain',
                  options: getUniqueColumnValues(data, 'poolChainNetwork').map(
                    (value) => ({
                      value: value as string,
                      label: (
                        <div className="flex items-center gap-2">
                          <ChainIcon chainSlug={value as string} />{' '}
                          {value.charAt(0).toUpperCase() + value.slice(1)}
                        </div>
                      ),
                    })
                  ),
                },
                {
                  column: 'userAddress',
                  title: 'Address',
                  options: getUniqueColumnValues(data, 'userAddress').map(
                    (value) => ({
                      value: value as string,
                      label: (
                        <div className="flex items-center gap-2">
                          <WalletAvatar address={value as string} size={20} />
                          {formatAddress(value as string)}
                        </div>
                      ),
                    })
                  ),
                },
              ]),
        ]}
      />
    </div>
  )
}
