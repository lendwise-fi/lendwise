'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRightFromSquare, Link } from 'lucide-react'

import { ChainIcon, ProtocolIcon, TokenIcon } from '@/components/icon'
import { DataTable, getUniqueColumnValues } from '@/components/table'
import { Badge } from '@/components/ui/badge'
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
    header: 'Protocol',
    size: 110,
    minSize: 110,
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className="flex w-fit items-center gap-2 px-2 py-1.5 whitespace-nowrap"
      >
        <ProtocolIcon protocol={row.original.protocol} />
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {getProtocolVersionNameById(row.original.protocol)}
        </span>
      </Badge>
    ),
  },
  {
    accessorKey: 'poolChainNetwork',
    header: 'Chain',
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className="flex w-fit items-center gap-2 px-2 py-1.5 whitespace-nowrap"
      >
        <ChainIcon chainSlug={row.original.poolChainNetwork} />
        <span className="text-muted-foreground text-xs">
          {row.original.poolChainNetwork}
        </span>
      </Badge>
    ),
  },
  {
    accessorKey: 'poolName',
    header: 'Vault / Pool',
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-2">
        <TokenIcon symbol={row.original.assetSymbol} />
        {row.original.poolName}
      </div>
    ),
    enableHiding: false,
  },
  {
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
      </div>
    ),

    enableHiding: false,
  },
  {
    accessorKey: 'apy',
    header: 'Apy',
    size: 60,
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

export function LendingTable({ data }: { data: LendMarket[] }) {
  const { baseCurrency, rate } = useCurrency()
  const columns = createColumns(baseCurrency, rate)

  return (
    <DataTable
      searchableColumn="poolName"
      filterableColumns={[
        {
          column: 'protocol',
          title: 'Protocol',
          options: getUniqueColumnValues(data, 'protocol').map((value) => ({
            value: value as string,
            label: (
              <div className="flex items-center gap-2">
                <ProtocolIcon protocol={value as string} />{' '}
                {getProtocolVersionNameById(value)}
              </div>
            ),
          })),
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
      ]}
      columns={columns}
      data={data}
    />
  )
}
