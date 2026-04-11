'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'

import { ProtocolIcon } from '@/components/icon/ProtocolIcon'
import { TokenIcon } from '@/components/icon/TokenIcon'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format-currency'

export type PositionData = {
  protocol: string
  network: string
  poolName: string
  assetSymbol: string
  amount: number
  valueInBaseCurrency: number
  apy?: number
  healthFactor?: number
  collateralRatio?: number
  liquidationPrice?: number
}

export function createColumns(
  type: 'supplying' | 'borrowing',
  baseCurrency: string
): ColumnDef<PositionData>[] {
  return [
    {
      accessorKey: 'protocol',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            Protocol
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const protocol = row.getValue('protocol') as string
        const poolName = row.original.poolName

        return (
          <div className="ml-2 flex items-center gap-3">
            <ProtocolIcon protocol={protocol} />
            <div>
              <div className="font-semibold">{poolName}</div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            Amount
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const amount = row.getValue('amount') as number
        const assetSymbol = row.original.assetSymbol
        return (
          <div className="ml-2 flex items-center gap-2">
            <TokenIcon symbol={assetSymbol} />
            <span className="text-sm font-medium">
              {formatCurrency(amount, assetSymbol, {})} {assetSymbol}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'apy',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            {type === 'supplying' ? 'APY' : 'APR'}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const apy = row.getValue('apy') as number | undefined
        if (!apy) return <span className="text-muted-foreground ml-2">-</span>
        return (
          <span
            className={`ml-2 font-medium ${
              type === 'supplying' ? 'text-green-500' : 'text-red-500'
            }`}
          >
            {apy.toFixed(2)}%
          </span>
        )
      },
    },
    ...(type === 'borrowing'
      ? [
          {
            accessorKey: 'healthFactor',
            header: ({ column }: { column: import('@tanstack/react-table').Column<PositionData, unknown> }) => {
              return (
                <Button
                  variant="ghost"
                  onClick={() =>
                    column.toggleSorting(column.getIsSorted() === 'asc')
                  }
                  className="h-8 px-2"
                >
                  Health Factor
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              )
            },
            cell: ({ row }: { row: import('@tanstack/react-table').Row<PositionData> }) => {
              const healthFactor = row.getValue('healthFactor') as
                | number
                | undefined
              if (!healthFactor)
                return <span className="text-muted-foreground ml-2">-</span>
              return (
                <span
                  className={`ml-2 font-semibold ${
                    healthFactor > 2
                      ? 'text-green-500'
                      : healthFactor > 1.5
                        ? 'text-yellow-500'
                        : 'text-red-500'
                  }`}
                >
                  {healthFactor.toFixed(2)}
                </span>
              )
            },
          },
          {
            accessorKey: 'collateralRatio',
            header: 'Collateral Ratio',
            cell: ({ row }: { row: import('@tanstack/react-table').Row<PositionData> }) => {
              const collateralRatio = row.getValue('collateralRatio') as
                | number
                | undefined
              if (!collateralRatio)
                return <span className="text-muted-foreground ml-2">-</span>
              return (
                <span className="ml-2 font-medium">
                  {(collateralRatio * 100).toFixed(0)}%
                </span>
              )
            },
          },
        ]
      : []),
    {
      accessorKey: 'valueInBaseCurrency',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            Value
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const value = row.getValue('valueInBaseCurrency') as number
        return (
          <span className="ml-2 text-base font-bold">
            {formatCurrency(value, baseCurrency, {})}
          </span>
        )
      },
    },
  ]
}
