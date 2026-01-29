'use client'

import { useState } from 'react'

import Link from 'next/link'

import { useQuery } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRightFromSquare, Calendar } from 'lucide-react'

import { loadLendingMarkets } from '@/app/actions/markets.actions'
import { ChainBadge } from '@/components/badge/ChainBadge'
import { ProtocolBadge } from '@/components/badge/ProtocolBadge'
import { ChainIcon, ProtocolIcon, TokenIcon } from '@/components/icon'
import {
  DataTable,
  SortableHeader,
  getUniqueColumnValues,
} from '@/components/table'
import { Badge } from '@/components/ui/badge'
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
import { LendMarket } from '@/types'

export type Horizon = 'intraday' | 'short' | 'medium' | 'long'

const HORIZON_CONFIG: Record<
  Horizon,
  { label: string; apyKey: keyof LendMarket; headerLabel: string }
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
  horizon: Horizon
): ColumnDef<LendMarket>[] => [
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
    accessorKey: 'poolChainNetwork',
    header: ({ column }) => (
      <SortableHeader column={column}>Chain</SortableHeader>
    ),
    enableHiding: false,
    enableSorting: true,
    cell: ({ row }) => <ChainBadge chainSlug={row.original.poolChainNetwork} />,
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
  {
    id: 'debug-apy',
    header: 'DEBUG APY',
    cell: ({ row }) => (
      <div className="flex flex-col text-[10px] leading-tight text-gray-500">
        <div>Day: {row.original.apyDaily}</div>
        <div>Mth: {row.original.apyMonthly}</div>
        <div>Yr: {row.original.apyYearly}</div>
        <div>Intra: {row.original.apy}</div>
      </div>
    ),
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

export function LendingTableClient() {
  const { baseCurrency, rate } = useCurrency()
  const [horizon, setHorizon] = useState<Horizon>('short')
  const columns = createColumns(baseCurrency, rate, horizon)
  const { data } = useQuery<LendMarket[]>({
    queryKey: ['lendingMarkets'],
    queryFn: loadLendingMarkets,
    staleTime: 60_000, // 60s - aligned with server revalidate
    refetchInterval: 60_000, // auto revalidation every 60s
    gcTime: 5 * 60 * 1000, // 5min
  })

  // Get the correct APY column to sort by based on horizon
  const sortColumn = HORIZON_CONFIG[horizon].apyKey as string

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
      </div>

      <DataTable
        key={horizon}
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
            column: 'poolChainNetwork',
            title: 'Chain',
            options: getUniqueColumnValues(data || [], 'poolChainNetwork').map(
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
        initialColumnFilters={[{ id: 'assetSymbol', value: 'USDC' }]}
        featuredRows={3}
      />
    </div>
  )
}
