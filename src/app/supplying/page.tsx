import { Suspense } from 'react'

import { SupplyingTableServer } from '@/components/markets/SupplyingTableServer'
import { TableSkeleton } from '@/components/markets/TableSkeleton'
import { Separator } from '@/components/ui/separator'

export default async function SupplyingPage() {
  return (
    <div className="flex-1 space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground mb-2 text-3xl font-bold">
            Supplying pools
          </h1>
          <p className="text-muted-foreground-400">
            All available supplying products across protocols and chains
          </p>
        </div>
      </div>
      <Separator className="my-3" />
      <Suspense fallback={<TableSkeleton />}>
        <SupplyingTableServer />
      </Suspense>
    </div>
  )
}
