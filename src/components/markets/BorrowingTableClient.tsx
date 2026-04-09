'use client'

import { useCallback, useState } from 'react'

import Link from 'next/link'

import { useQuery } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRightFromSquare, Calendar } from 'lucide-react'

import { loadBorrowingMarkets } from '@/app/actions/markets.actions'
import { NetworkBadge } from '@/components/badge/NetworkBadge'
import { ProtocolBadge } from '@/components/badge/ProtocolBadge'
import { NetworkIcon, ProtocolIcon, TokenIcon } from '@/components/icon'
import { TableSkeleton } from '@/components/markets/TableSkeleton'
import {
  DataTable,
  SortableHeader,
  getUniqueColumnValues,
} from '@/components/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
    cell: ({ row }) => {
      const supply = BigInt(row.original.assetAmount || '0')
      const liquidity = BigInt(row.original.liquidityAmount || '0')
      const utilizationPct =
        supply > 0n ? 100 - Number((liquidity * 10000n) / supply) / 100 : 0
      return (
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
        <span>
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

export function BorrowingTableClient() {
  const { baseCurrency, rate } = useCurrency()
  const [horizon, setHorizon] = useState<Horizon>('short')
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  const { data, isPending } = useQuery<SupplyMarket[]>({
    queryKey: ['borrowingMarkets'],
    queryFn: loadBorrowingMarkets,
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
    (row: SupplyMarket) => `${row.protocol}-${row.poolChainId}-${row.poolId}`,
    []
  )

  if (isPending) return <TableSkeleton />

  return (
    <div className="space-y-4">
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
