import { Suspense } from 'react'

import { LendingTableServer } from '@/components/markets/LendingTableServer'
import { LendingTableSkeleton } from '@/components/markets/LendingTableSkeleton'
import { Separator } from '@/components/ui/separator'

export default async function LendingPage() {
  return (
    <div className="flex-1 space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground mb-2 text-3xl font-bold">
            Lending pools
          </h1>
          <p className="text-muted-foreground-400">
            All available lending pools across protocols and chains
          </p>
        </div>
      </div>
      <Separator className="my-3" />
      <Suspense fallback={<LendingTableSkeleton />}>
        <LendingTableServer />
      </Suspense>
    </div>
  )
}
