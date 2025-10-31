'use client'

import { Wallet } from 'lucide-react'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

export function PieChartDonutTextEmpty() {
  return (
    <Empty>
      <EmptyContent>
        <EmptyMedia variant="icon">
          <Wallet />
        </EmptyMedia>
        <EmptyTitle>No positions found</EmptyTitle>
        <EmptyDescription>You don't have any positions yet.</EmptyDescription>
      </EmptyContent>
    </Empty>
  )
}
