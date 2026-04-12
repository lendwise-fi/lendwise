'use client'

import { useCallback, useState, useTransition } from 'react'

import Link from 'next/link'

import { useQuery } from '@tanstack/react-query'
import { ColumnDef, ColumnFiltersState } from '@tanstack/react-table'
import {
  AlertCircle,
  ArrowUpRightFromSquare,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Search,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { loadMarketBorrowHistoryRates } from '@/app/actions/market-rates.actions'
import { loadBorrowProducts } from '@/app/actions/products.actions'
import { NetworkBadge } from '@/components/badge/NetworkBadge'
import { ProtocolBadge } from '@/components/badge/ProtocolBadge'
import { NetworkIcon, ProtocolIcon, TokenIcon } from '@/components/icon'
import { BorrowingOptimizerView } from '@/components/optimizer/BorrowingOptimizerButton'
import { TableSkeleton } from '@/components/products/TableSkeleton'
import { StatsBar } from '@/components/stats/StatsBar'
import { FilterChip } from '@/components/table'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { PieChartMini } from '@/components/ui/pie-chart-mini'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getProtocolVersionNameById } from '@/config/protocols'
import { useCurrency } from '@/contexts'
import { useIsMobile } from '@/hooks/useMobile'
import { formatCompactCurrency } from '@/lib/format-currency'
import { analyze } from '@/lib/utils'
import {
  BorrowProduct,
  MarketRate,
  TIMEFRAME_OPTIONS,
  TimeframeLabel,
} from '@/types'

export type Horizon = 'intraday' | 'short' | 'medium' | 'long'

export const HORIZON_CONFIG: Record<
  Horizon,
  { label: string; apyKey: keyof BorrowProduct; headerLabel: string }
> = {
  intraday: { label: 'Intraday', apyKey: 'apy', headerLabel: 'APY' },
  short: {
    label: 'Short term',
    apyKey: 'apyDaily',
    headerLabel: 'APY (daily)',
  },
  medium: {
    label: 'Medium term',
    apyKey: 'apyMonthly',
    headerLabel: 'APY (monthly)',
  },
  long: {
    label: 'Long term',
    apyKey: 'apyYearly',
    headerLabel: 'APY (yearly)',
  },
}

const createColumns = (
  currency: string,
  rate: number,
  horizon: Horizon,
  selectedCount: number
): ColumnDef<BorrowProduct>[] => [
  {
    id: 'select',
    size: 40,
    header: '',
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        disabled={!row.getIsSelected() && selectedCount >= 10}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'protocol',
    header: ({ column }) => (
      <SortableHeader column={column}>Protocol</SortableHeader>
    ),
    size: 110,
    minSize: 110,
    enableHiding: false,
    enableSorting: true,
    cell: ({ row }) => <ProtocolBadge protocol={row.original.protocol} />,
  },
  {
    accessorKey: 'network',
    header: ({ column }) => (
      <SortableHeader column={column}>Network</SortableHeader>
    ),
    enableHiding: false,
    enableSorting: true,
    cell: ({ row }) => <NetworkBadge networkSlug={row.original.network} />,
  },
  {
    accessorKey: 'poolName',
    header: '',
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'assetSymbol',
    header: ({ column }) => (
      <SortableHeader column={column}>Loan</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-2">
        <TokenIcon symbol={row.original.assetSymbol} />
        <TableCellViewer item={row.original} />
      </div>
    ),
    enableHiding: false,
    enableSorting: true,
  },
  {
    accessorKey: 'collaterals',
    header: ({ column }) => (
      <SortableHeader column={column}>Collaterals</SortableHeader>
    ),
    cell: ({ row }) => {
      const collaterals = row.original.collaterals
      if (collaterals.length === 0) return null
      if (collaterals.length === 1) {
        return (
          <div className="flex w-full items-center gap-2">
            <TokenIcon symbol={collaterals[0].symbol} />
            <span>{collaterals[0].symbol}</span>
          </div>
        )
      }
      return (
        <div className="flex w-full items-center gap-1">
          {collaterals.map((collateral) => (
            <Tooltip key={collateral.symbol}>
              <TooltipTrigger asChild>
                <span>
                  <TokenIcon symbol={collateral.symbol} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{collateral.symbol}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )
    },
    enableHiding: false,
    enableSorting: false,
  },
  {
    accessorKey: 'assetAmountUsd',
    header: ({ column }) => (
      <SortableHeader column={column}>Deposits</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-3">
        <span className="font-mono">
          {formatCompactCurrency(
            row.original.assetAmount,
            row.original.assetSymbol,
            row.original.assetDecimals
          )}
        </span>
        <Badge variant="secondary" className="font-mono">
          {formatCompactCurrency(row.original.assetAmountUsd * rate, currency)}
        </Badge>
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'liquidityAmountUsd',
    header: ({ column }) => (
      <SortableHeader column={column}>Liquidity</SortableHeader>
    ),
    cell: ({ row }) => {
      const supply = BigInt(row.original.assetAmount || '0')
      const liquidity = BigInt(row.original.liquidityAmount || '0')
      const utilizationPct =
        supply > 0n ? 100 - Number((liquidity * 10000n) / supply) / 100 : 0
      return (
        <div className="flex w-full items-center gap-3">
          <span className="font-mono">
            {formatCompactCurrency(
              row.original.liquidityAmount,
              row.original.assetSymbol,
              row.original.assetDecimals
            )}
          </span>
          <Badge variant="secondary" className="font-mono">
            {formatCompactCurrency(
              row.original.liquidityAmountUsd * rate,
              currency
            )}
          </Badge>
          <PieChartMini percentage={utilizationPct} />
        </div>
      )
    },
    enableHiding: false,
  },
  {
    accessorKey: HORIZON_CONFIG[horizon].apyKey,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {HORIZON_CONFIG[horizon].headerLabel}
      </SortableHeader>
    ),
    size: 60,
    enableSorting: true,
    sortingFn: 'basic',
    cell: ({ row }) => {
      const apyValue = row.original[HORIZON_CONFIG[horizon].apyKey] as
        | number
        | undefined
      return (
        <span className="font-mono">
          {apyValue !== undefined ? `${(apyValue * 100).toFixed(2)}%` : '-'}
        </span>
      )
    },
    enableHiding: false,
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

function TableCellViewer({ item }: { item: BorrowProduct }) {
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
        const rates = await loadMarketBorrowHistoryRates({
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
          className="text-foreground decoration-muted-foreground w-fit cursor-pointer px-0 text-left text-xs underline decoration-dashed underline-offset-6"
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
              <NetworkBadge networkSlug={item.network} />
            </div>
          </DrawerDescription>
        </DrawerHeader>
        <Separator className="mb-4" />
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {/* APY Info Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-muted-foreground text-xs">Current APY</div>
              <div className="text-lg font-semibold">
                {(item.apy * 100).toFixed(2)}%
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-muted-foreground text-xs">Loan Asset</div>
              <div className="text-lg font-semibold">{item.assetSymbol}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-muted-foreground text-xs">
                Total Borrowed
              </div>
              <div className="text-sm font-medium">
                {formatCompactCurrency(
                  item.assetAmount,
                  item.assetSymbol,
                  item.assetDecimals
                )}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-muted-foreground text-xs">
                Available Liquidity
              </div>
              <div className="text-sm font-medium">
                {formatCompactCurrency(
                  item.liquidityAmount,
                  item.assetSymbol,
                  item.assetDecimals
                )}
              </div>
            </div>
          </div>

          {/* Collaterals */}
          {item.collaterals.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-muted-foreground mb-2 text-xs">
                  Accepted Collaterals
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.collaterals.map((collateral) => (
                    <Badge key={collateral.symbol} variant="secondary">
                      <TokenIcon
                        symbol={collateral.symbol}
                        className="mr-1 h-3 w-3"
                      />
                      {collateral.symbol}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* APY Chart */}
          <div className="flex items-center justify-between gap-2 leading-none font-medium">
            <div className="flex items-center gap-2">
              Borrow APY <TrendingUp className="size-4" />
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
              <ChartContainer config={chartConfig} className="h-full w-full">
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
                      fill: 'var(--muted-foreground)',
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
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function BorrowTableClient() {
  const { baseCurrency, rate } = useCurrency()
  const [horizon, setHorizon] = useState<Horizon>('intraday')
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState(1)
  const [snapshotMarkets, setSnapshotMarkets] = useState<BorrowProduct[]>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: 'assetSymbol', value: 'USDC' },
  ])
  const [searchValue, setSearchValue] = useState('')

  const { data, isPending } = useQuery<BorrowProduct[]>({
    queryKey: ['borrowProducts'],
    queryFn: loadBorrowProducts,
    staleTime: 60_000,
    refetchInterval: 60_000,
    gcTime: 5 * 60 * 1000,
  })

  const columns = createColumns(
    baseCurrency,
    rate,
    horizon,
    Object.keys(rowSelection).length
  )
  const sortColumn = HORIZON_CONFIG[horizon].apyKey as string

  const getRowId = useCallback(
    (row: BorrowProduct) => `${row.protocol}-${row.poolChainId}-${row.poolId}`,
    []
  )

  const markets = data || []

  // For non-intraday horizons, hide rows without enough historical data in MongoDB
  const visibleMarkets =
    horizon === 'intraday'
      ? markets
      : markets.filter((m) => m[HORIZON_CONFIG[horizon].apyKey] !== undefined)

  const selectedData = visibleMarkets.filter(
    (row) => rowSelection[getRowId(row)]
  )

  const isFiltered = columnFilters.length > 0 || searchValue !== ''

  // Filter options
  const protocolOptions = getUniqueColumnValues(visibleMarkets, 'protocol').map(
    (v) => ({
      value: v as string,
      label: (
        <div className="flex items-center gap-2">
          <ProtocolIcon protocol={v as string} />{' '}
          {getProtocolVersionNameById(v)}
        </div>
      ),
    })
  )
  const networkOptions = getUniqueColumnValues(visibleMarkets, 'network').map(
    (v) => ({
      value: v as string,
      label: (
        <div className="flex items-center gap-2">
          <NetworkIcon networkSlug={v as string} />
          {(v as string).charAt(0).toUpperCase() + (v as string).slice(1)}
        </div>
      ),
    })
  )
  const tokenOptions = getUniqueColumnValues(visibleMarkets, 'assetSymbol').map(
    (v) => ({
      value: v as string,
      label: (
        <div className="flex items-center gap-2">
          <TokenIcon symbol={v as string} /> {v}
        </div>
      ),
    })
  )
  const collateralOptions = Array.from(
    new Set(
      visibleMarkets.flatMap((row) => row.collaterals.map((c) => c.symbol))
    )
  )
    .sort()
    .map((symbol) => ({
      value: symbol,
      label: (
        <div className="flex items-center gap-2">
          <TokenIcon symbol={symbol} /> {symbol}
        </div>
      ),
    }))

  // Faceted counts: apply all active filters EXCEPT the target column's own filter,
  // so each chip shows "how many results you'd get by picking that option".
  const applyFiltersExcept = (excludeId: string) =>
    visibleMarkets.filter((m) =>
      columnFilters.every((f) => {
        if (f.id === excludeId) return true
        if (f.id === 'collaterals') {
          const v = f.value as string
          return m.collaterals.some((c) => c.symbol === v)
        }
        const cell = String(m[f.id as keyof BorrowProduct] ?? '')
        return Array.isArray(f.value)
          ? (f.value as string[]).includes(cell)
          : cell === String(f.value)
      })
    )

  const protocolCounts = applyFiltersExcept('protocol').reduce((acc, m) => {
    acc.set(m.protocol, (acc.get(m.protocol) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  const networkCounts = applyFiltersExcept('network').reduce((acc, m) => {
    acc.set(m.network, (acc.get(m.network) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  const tokenCounts = applyFiltersExcept('assetSymbol').reduce((acc, m) => {
    acc.set(m.assetSymbol, (acc.get(m.assetSymbol) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  const collateralCounts = applyFiltersExcept('collaterals').reduce(
    (acc, m) => {
      m.collaterals.forEach((c) => {
        acc.set(c.symbol, (acc.get(c.symbol) ?? 0) + 1)
      })
      return acc
    },
    new Map<string, number>()
  )

  const result = analyze(markets, (i) => i.apy)

  if (isPending) return <TableSkeleton variant="borrow" />

  return (
    <div className="flex flex-col">
      {/* Stats bar */}

      <StatsBar
        stats={[
          {
            label: 'Total products',
            value: markets.length.toString(),
            sub: `across ${result.set.size} protocols`,
          },
          {
            label: 'Worst rate',
            value: `${result.min.toFixed(2)}%`,
            sub: 'AaveV3 WETH',
            accent: true,
          },
          {
            label: 'Best rate',
            value: `${result.max.toFixed(2)}%`,
            sub: 'all networks',
          },
        ]}
      />

      {/* Page header: title left + all controls right */}
      <div className="border-border/50 flex flex-wrap items-center justify-between gap-3 border-b px-8 py-5">
        <div>
          <h1 className="text-foreground text-xl font-bold">Borrow products</h1>
          <p className="text-muted-foreground text-xs">
            All available borrowing markets across protocols and chains
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Optimize */}
          {Object.keys(rowSelection).length > 0 && (
            <Dialog
              open={isModalOpen}
              onOpenChange={(open) => {
                setIsModalOpen(open)
                if (!open) {
                  setModalStep(1)
                  setSnapshotMarkets([])
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs">
                  <Zap className="h-3.5 w-3.5" />
                  Optimize ({Object.keys(rowSelection).length})
                </Button>
              </DialogTrigger>
              <DialogContent
                showCloseButton={false}
                className="sm:max-w-4xl gap-0 overflow-hidden p-0"
              >
                <DialogTitle className="sr-only">Yield Optimizer</DialogTitle>
                {/* Custom header */}
                <div className="border-border flex items-start justify-between border-b px-7 pt-6 pb-5">
                  <div>
                    <div className="mb-1 flex items-center gap-2.5">
                      <div className="bg-primary/15 flex h-7 w-7 items-center justify-center rounded-lg">
                        <Zap className="text-primary h-4 w-4" />
                      </div>
                      <h2 className="text-base font-semibold">
                        Yield Optimizer
                      </h2>
                    </div>
                    <p className="text-muted-foreground ml-9 text-xs">
                      {modalStep === 1
                        ? `${selectedData.length} market${selectedData.length !== 1 ? 's' : ''} selected — review before optimizing`
                        : 'Set parameters and run the optimizer engine'}
                    </p>
                  </div>

                  {/* Stepper */}
                  <div className="mr-6 flex items-center gap-1">
                    {[
                      { step: 1, label: 'Selection' },
                      { step: 2, label: 'Configure' },
                    ].map((s, i) => (
                      <div key={s.step} className="flex items-center gap-1">
                        {i > 0 && (
                          <div
                            className={`mx-1 h-px w-8 transition-colors ${modalStep > 1 ? 'bg-primary/40' : 'bg-border'}`}
                          />
                        )}
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                            modalStep === s.step
                              ? 'bg-primary text-primary-foreground'
                              : modalStep > s.step
                                ? 'bg-primary/20 text-primary'
                                : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {modalStep > s.step ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            s.step
                          )}
                        </div>
                        <span
                          className={`text-xs font-medium ${modalStep === s.step ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <DialogClose className="rounded-lg p-1.5 transition-colors hover:bg-secondary/60">
                    <X className="text-muted-foreground h-4 w-4" />
                  </DialogClose>
                </div>

                {/* Body */}
                {modalStep === 1 ? (
                  <div>
                    <div className="max-h-72 space-y-2 overflow-y-auto px-7 py-5">
                      {selectedData.map((pool, i) => (
                        <div
                          key={i}
                          className="border-border/50 hover:border-border bg-secondary/30 flex items-center gap-4 rounded-xl border p-3.5 transition-colors"
                        >
                          <div className="from-primary to-primary/30 h-10 w-1 shrink-0 rounded-full bg-gradient-to-b" />
                          <ProtocolBadge protocol={pool.protocol} />
                          <NetworkBadge networkSlug={pool.network} />
                          <span className="text-foreground flex-1 truncate text-sm font-medium">
                            {pool.poolName}
                          </span>
                          <span
                            className={`font-mono text-sm font-semibold ${
                              pool.apy > 0.5
                                ? 'text-orange-400'
                                : pool.apy > 0.1
                                  ? 'text-emerald-400'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {(pool.apy * 100).toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end px-7 pb-6">
                      <Button
                        onClick={() => {
                          setSnapshotMarkets(selectedData)
                          setModalStep(2)
                        }}
                      >
                        Configure Optimizer
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="px-7 py-2">
                    <BorrowingOptimizerView
                      markets={snapshotMarkets}
                      onBack={() => setModalStep(1)}
                    />
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}

          {/* Horizon */}
          <Select
            value={horizon}
            onValueChange={(value) => setHorizon(value as Horizon)}
          >
            <SelectTrigger className="border-border h-8 w-48 text-xs">
              <Calendar className="h-3 w-3" />
              <span className="text-muted-foreground">Horizon:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(HORIZON_CONFIG).map(([value, config]) => (
                <SelectItem key={value} value={value}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              placeholder="Filter..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-9 w-36 pl-7 text-xs placeholder:text-xs"
            />
          </div>

          {/* Filter chips */}
          <FilterChip
            title="Protocol"
            columnId="protocol"
            options={protocolOptions}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            renderIcon={(v) => <ProtocolIcon protocol={v} />}
            counts={protocolCounts}
          />
          <FilterChip
            title="Network"
            columnId="network"
            options={networkOptions}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            renderIcon={(v) => <NetworkIcon networkSlug={v} />}
            counts={networkCounts}
          />
          <FilterChip
            title="Loan"
            columnId="assetSymbol"
            options={tokenOptions}
            multiSelect={false}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            renderIcon={(v) => <TokenIcon symbol={v} />}
            counts={tokenCounts}
          />
          <FilterChip
            title="Collateral"
            columnId="collaterals"
            options={collateralOptions}
            multiSelect={false}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            renderIcon={(v) => <TokenIcon symbol={v} />}
            counts={collateralCounts}
          />

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setColumnFilters([])
                setSearchValue('')
              }}
            >
              Reset <X className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <DataTable
        key={horizon}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        hiddenColumns={['poolName']}
        searchableColumns={{
          columns: ['poolName', 'assetSymbol'],
          getExtraSearchValues: (row) => row.collaterals.map((c) => c.symbol),
        }}
        filterableColumns={[
          { column: 'protocol', title: 'Protocol', options: protocolOptions },
          { column: 'network', title: 'Network', options: networkOptions },
          {
            column: 'assetSymbol',
            title: 'Token',
            multiSelect: false,
            options: tokenOptions,
          },
          {
            column: 'collaterals',
            title: 'Collateral',
            multiSelect: false,
            getFilterValues: (row: BorrowProduct) =>
              row.collaterals.map((c) => c.symbol),
            options: collateralOptions,
          },
        ]}
        columns={columns}
        data={visibleMarkets}
        initialSorting={[{ id: sortColumn, desc: true }]}
        getRowId={getRowId}
        hideToolbar={true}
        columnFilters={columnFilters}
        onColumnFiltersChange={setColumnFilters}
        globalFilter={searchValue}
        onGlobalFilterChange={setSearchValue}
      />
    </div>
  )
}
