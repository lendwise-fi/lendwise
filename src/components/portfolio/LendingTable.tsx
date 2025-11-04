'use client'

import Link from 'next/link'

import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRightFromSquare, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'

import { ChainIcon, ProtocolIcon, TokenIcon } from '@/components/icon'
import { DataTable, getUniqueColumnValues } from '@/components/table'
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
import { Separator } from '@/components/ui/separator'
import { WalletAvatar } from '@/components/wallet/WalletAvatar'
import { useIsMobile } from '@/hooks/useMobile'
import { formatCompactCurrency } from '@/lib/format-currency'
import { formatToken } from '@/lib/formatters'
import { formatAddress } from '@/lib/utils'
import { LendPosition } from '@/types'

const columns: ColumnDef<LendPosition>[] = [
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
          {row.original.protocol}
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
        <TableCellViewer item={row.original} />
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'userAddress',
    header: 'Address',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <WalletAvatar address={row.original.userAddress} size={20} />
        {formatAddress(row.original.userAddress)}
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
          {formatCompactCurrency(row.original.assetAmountUsd, 'USD')}
        </Badge>
      </div>
    ),

    enableHiding: false,
  },
  {
    accessorKey: 'apy',
    header: 'APY',
    cell: ({ row }) => <span>{row.original.apy}%</span>,
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

const chartData = [
  { month: 'January', desktop: 186, mobile: 80 },
  { month: 'February', desktop: 305, mobile: 200 },
  { month: 'March', desktop: 237, mobile: 120 },
  { month: 'April', desktop: 73, mobile: 190 },
  { month: 'May', desktop: 209, mobile: 130 },
  { month: 'June', desktop: 214, mobile: 140 },
]

const chartConfig = {
  desktop: {
    label: 'Desktop',
    color: 'var(--primary)',
  },
  mobile: {
    label: 'Mobile',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

function TableCellViewer({ item }: { item: LendPosition }) {
  const isMobile = useIsMobile()

  return (
    <Drawer direction={isMobile ? 'bottom' : 'right'}>
      <DrawerTrigger asChild>
        <Button variant="link" className="text-foreground w-fit px-0 text-left">
          {item.poolName}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{item.poolName}</DrawerTitle>
          <DrawerDescription>
            Showing total visitors for the last 6 months
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {!isMobile && (
            <>
              <ChartContainer config={chartConfig}>
                <AreaChart
                  accessibilityLayer
                  data={chartData}
                  margin={{
                    left: 0,
                    right: 10,
                  }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => value.slice(0, 3)}
                    hide
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dot" />}
                  />
                  <Area
                    dataKey="mobile"
                    type="natural"
                    fill="var(--color-mobile)"
                    fillOpacity={0.6}
                    stroke="var(--color-mobile)"
                    stackId="a"
                  />
                  <Area
                    dataKey="desktop"
                    type="natural"
                    fill="var(--color-desktop)"
                    fillOpacity={0.4}
                    stroke="var(--color-desktop)"
                    stackId="a"
                  />
                </AreaChart>
              </ChartContainer>
              <Separator />
              <div className="grid gap-2">
                <div className="flex gap-2 leading-none font-medium">
                  Trending up by 5.2% this month{' '}
                  <TrendingUp className="size-4" />
                </div>
                <div className="text-muted-foreground">
                  Showing total visitors for the last 6 months. This is just
                  some random text to test the layout. It spans multiple lines
                  and should wrap around.
                </div>
              </div>
              <Separator />
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
  return (
    <div>
      <h2 className="text-foreground text-2xl font-semibold">
        Lending positions
      </h2>
      <Separator className="my-3" />
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
                  <ProtocolIcon protocol={value as string} /> {value}
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
                    <ChainIcon chainSlug={value as string} /> {value}
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
        ]}
        columns={columns}
        data={data}
      />
    </div>
  )
}
