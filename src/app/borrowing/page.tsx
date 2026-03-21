import { Suspense } from 'react'

import { BorrowingTableServer } from '@/components/markets/BorrowingTableServer'
import { TableSkeleton } from '@/components/markets/TableSkeleton'
import { Separator } from '@/components/ui/separator'

export const dynamic = 'force-dynamic'

export default async function BorrowingPage() {
  return (
    <div className="flex-1 space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground mb-2 text-3xl font-bold">
            Borrowing pools
          </h1>
          <p className="text-muted-foreground-400">
            All available borrowing products across protocols and chains
          </p>
        </div>
      </div>
      <Separator className="my-3" />
      <Suspense fallback={<TableSkeleton />}>
        <BorrowingTableServer />
      </Suspense>
    </div>
  )
}
