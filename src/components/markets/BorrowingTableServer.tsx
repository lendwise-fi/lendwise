import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query'

import { loadBorrowingMarkets } from '@/app/actions/markets.actions'

import { BorrowingTableClient } from './BorrowingTableClient'

export async function BorrowingTableServer() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: ['borrowingMarkets'],
    queryFn: loadBorrowingMarkets,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BorrowingTableClient />
    </HydrationBoundary>
  )
}
