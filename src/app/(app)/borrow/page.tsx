import { Suspense } from 'react'

import { BorrowTableServer } from '@/components/products/BorrowTableServer'
import { TableSkeleton } from '@/components/products/TableSkeleton'

export const dynamic = 'force-dynamic'

export default async function BorrowPage() {
  return (
    <div className="flex flex-col">
      <Suspense fallback={<TableSkeleton />}>
        <BorrowTableServer />
      </Suspense>
    </div>
  )
}
