'use client'

import { useCallback, useState } from 'react'

import Link from 'next/link'

import { useQuery } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRightFromSquare, Calendar, Eye } from 'lucide-react'

import { loadSupplyingMarkets } from '@/app/actions/markets.actions'
import { NetworkBadge } from '@/components/badge/NetworkBadge'
import { ProtocolBadge } from '@/components/badge/ProtocolBadge'
import { NetworkIcon, ProtocolIcon, TokenIcon } from '@/components/icon'
import { TableSkeleton } from '@/components/markets/TableSkeleton'
import { SupplyingOptimizerView } from '@/components/optimizer/SupplyingOptimizerButton'
import {
  DataTable,
  SortableHeader,
  getUniqueColumnValues,
} from '@/components/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PieChartMini } from '@/components/ui/pie-chart-mini'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getProtocolVersionNameById } from '@/config/protocols'
import { useCurrency } from '@/contexts'
import { formatCompactCurrency } from '@/lib/format-currency'
import { SupplyMarket } from '@/types'

export type Horizon = 'intraday' | 'short' | 'medium' | 'long'

export const HORIZON_CONFIG: Record<
  Horizon,
  { label: string; apyKey: keyof SupplyMarket; headerLabel: string }
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
): ColumnDef<SupplyMarket>[] => [
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
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-2">
        <TokenIcon symbol={row.original.assetSymbol} />
        {row.original.poolName}
      </div>
    ),
    enableHiding: false,
    enableSorting: true,
  },
  {
    accessorKey: 'assetSymbol',
    header: 'Deposits',
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-3">
        {formatCompactCurrency(
          row.original.assetAmount,
          row.original.assetSymbol,
          row.original.assetDecimals
        )}
        <Badge variant="secondary">
          {formatCompactCurrency(row.original.assetAmountUsd * rate, currency)}
        </Badge>
      </div>
    ),

    enableHiding: false,
  },
  {
    header: 'Liquidity',
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-3">
        {formatCompactCurrency(
          row.original.liquidityAmount,
          row.original.assetSymbol,
          row.original.assetDecimals
        )}
        <Badge variant="secondary">
          {formatCompactCurrency(
            row.original.liquidityAmountUsd * rate,
            currency
          )}
        </Badge>
        <PieChartMini
          percentage={
            Number(
              (BigInt(row.original.liquidityAmount) * 10000n) /
                BigInt(row.original.assetAmount)
            ) / 100
          }
        />
      </div>
    ),

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
        <span>
          {apyValue !== undefined ? `${(apyValue * 100).toFixed(2)}%` : '-'}
        </span>
      )
    },
    enableHiding: false,
  },
  // {
  //   id: 'debug-apy',
  //   header: 'DEBUG APY',
  //   cell: ({ row }) => (
  //     <div className="flex flex-col text-[10px] leading-tight text-gray-500">
  //       <div>Day: {row.original.apyDaily}</div>
  //       <div>Mth: {row.original.apyMonthly}</div>
  //       <div>Yr: {row.original.apyYearly}</div>
  //       <div>Intra: {row.original.apy}</div>
  //     </div>
  //   ),
  // },
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

export function SupplyingTableClient() {
  const { baseCurrency, rate } = useCurrency()
  const [horizon, setHorizon] = useState<Horizon>('short')
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState(1)
  const [snapshotMarkets, setSnapshotMarkets] = useState<SupplyMarket[]>([])

  const columns = createColumns(
    baseCurrency,
    rate,
    horizon,
    Object.keys(rowSelection).length
  )
  const { data, isPending } = useQuery<SupplyMarket[]>({
    queryKey: ['supplyingMarkets'],
    queryFn: loadSupplyingMarkets,
    staleTime: 60_000, // 60s - aligned with server revalidate
    refetchInterval: 60_000, // auto revalidation every 60s
    gcTime: 5 * 60 * 1000, // 5min
  })

  // Get the correct APY column to sort by based on horizon
  const sortColumn = HORIZON_CONFIG[horizon].apyKey as string

  // Unique ID for rows to maintain selection state across filters
  const getRowId = useCallback(
    (row: SupplyMarket) => `${row.protocol}-${row.poolChainId}-${row.poolId}`,
    []
  )

  const selectedData = (data || []).filter((row) => rowSelection[getRowId(row)])

  if (isPending) return <TableSkeleton />

  return (
    <div className="space-y-4">
      {/* Horizon Selector */}
      <div className="flex items-center gap-3">
        <Label htmlFor="horizon" className="text-sm font-medium">
          <Calendar className="mr-2 inline-block h-4 w-4" />
          Horizon
        </Label>
        <Select
          value={horizon}
          onValueChange={(value) => setHorizon(value as Horizon)}
        >
          <SelectTrigger id="horizon" className="w-40">
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
              <Button variant="outline" size="sm" className="ml-auto">
                <Eye className="mr-2 h-4 w-4" />
                Optimize Selection ({Object.keys(rowSelection).length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-7xl min-w-[80vw]">
              <DialogHeader>
                <DialogTitle>Selection Review</DialogTitle>
                <DialogDescription>
                  {modalStep === 1
                    ? 'Review your selected pools before optimizing.'
                    : 'Configure your optimization parameters.'}
                </DialogDescription>
              </DialogHeader>

              {/* Stepper */}
              <div className="mb-6 flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      modalStep >= 1
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    1
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      modalStep >= 1 ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    Selection
                  </span>
                </div>
                <div
                  className={`h-px w-12 transition-colors ${
                    modalStep >= 2 ? 'bg-primary' : 'bg-muted'
                  }`}
                />
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      modalStep >= 2
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    2
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      modalStep >= 2 ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    Optimizer
                  </span>
                </div>
              </div>

              {modalStep === 1 ? (
                <div className="space-y-4">
                  <div className="max-h-[60vh] overflow-x-auto">
                    <DataTable
                      columns={columns.filter(
                        (col) =>
                          // Protocol column
                          ('accessorKey' in col &&
                            col.accessorKey === 'protocol') ||
                          // Network column
                          ('accessorKey' in col &&
                            col.accessorKey === 'network') ||
                          // Name column
                          ('accessorKey' in col &&
                            col.accessorKey === 'poolName') ||
                          // Deposits column
                          ('header' in col && col.header === 'Deposits') ||
                          // Liquidity column
                          ('header' in col && col.header === 'Liquidity') ||
                          // APY column
                          ('accessorKey' in col &&
                            col.accessorKey === HORIZON_CONFIG[horizon].apyKey)
                      )}
                      data={selectedData}
                      getRowId={getRowId}
                      hideHeader={true}
                      hidePagination={true}
                      rowSelection={rowSelection}
                      onRowSelectionChange={setRowSelection}
                      initialSorting={[{ id: sortColumn, desc: true }]}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => {
                        setSnapshotMarkets(selectedData)
                        setModalStep(2)
                      }}
                    >
                      Next: Optimize Portfolio
                    </Button>
                  </div>
                </div>
              ) : (
                <SupplyingOptimizerView
                  markets={snapshotMarkets}
                  onBack={() => setModalStep(1)}
                />
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <DataTable
        key={horizon}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        searchableColumn="poolName"
        filterableColumns={[
          {
            column: 'protocol',
            title: 'Protocol',
            options: getUniqueColumnValues(data || [], 'protocol').map(
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
            column: 'network',
            title: 'Network',
            options: getUniqueColumnValues(data || [], 'network').map(
              (value) => ({
                value: value as string,
                label: (
                  <div className="flex items-center gap-2">
                    <NetworkIcon networkSlug={value as string} />{' '}
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </div>
                ),
              })
            ),
          },
          {
            column: 'assetSymbol',
            title: 'Token',
            multiSelect: false,
            options: getUniqueColumnValues(data || [], 'assetSymbol').map(
              (value) => ({
                value: value as string,
                label: (
                  <div className="flex items-center gap-2">
                    <TokenIcon symbol={value as string} /> {value}
                  </div>
                ),
              })
            ),
          },
        ]}
        columns={columns}
        data={data || []}
        initialSorting={[{ id: sortColumn, desc: true }]}
        getRowId={getRowId}
        initialColumnFilters={[{ id: 'assetSymbol', value: 'USDC' }]}
      />
    </div>
  )
}
