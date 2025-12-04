'use client'

import Link from 'next/link'

import { useQuery } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRightFromSquare } from 'lucide-react'

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
import { PieChartMini } from '@/components/ui/pie-chart-mini'
import { getProtocolVersionNameById } from '@/config/protocols'
import { useCurrency } from '@/contexts'
import { formatCompactCurrency } from '@/lib/format-currency'
import { formatToken } from '@/lib/formatters'
import { LendMarket } from '@/types'

const createColumns = (
  currency: string,
  rate: number
): ColumnDef<LendMarket>[] => [
  {
    accessorKey: 'protocol',
    header: ({ column }) => (
      <SortableHeader column={column}>Protocol</SortableHeader>
    ),
    size: 110,
    minSize: 110,
    enableSorting: true,
    cell: ({ row }) => <ProtocolBadge protocol={row.original.protocol} />,
  },
  {
    accessorKey: 'poolChainNetwork',
    header: ({ column }) => (
      <SortableHeader column={column}>Chain</SortableHeader>
    ),
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
        {formatToken(
          row.original.assetAmount,
          row.original.assetDecimals,
          row.original.assetSymbol
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
        {formatToken(
          row.original.liquidityAmount,
          row.original.assetDecimals,
          row.original.assetSymbol
        )}
        <Badge variant="secondary">
          {formatCompactCurrency(
            row.original.liquidityAmountUsd * rate,
            currency
          )}
        </Badge>
        <PieChartMini
          percentage={
            (Number(row.original.liquidityAmount) /
              Number(row.original.assetAmount)) *
            100
          }
        />
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
    enableSorting: true,
    sortingFn: 'basic',
    cell: ({ row }) => (
      <span>{Number(row.original.apy * 100).toFixed(2)}%</span>
    ),
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

export function LendingTableClient() {
  const { baseCurrency, rate } = useCurrency()
  const columns = createColumns(baseCurrency, rate)
  const { data } = useQuery<LendMarket[]>({
    queryKey: ['lendingMarkets'],
    queryFn: loadLendingMarkets,
    staleTime: 60_000, // 60s - aligned with server revalidate
    refetchInterval: 60_000, // auto revalidation every 60s
    gcTime: 5 * 60 * 1000, // 5min
  })

  return (
    <DataTable
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
    />
  )
}
