import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query'

import { loadBorrowProducts } from '@/app/actions/products.actions'

import { BorrowTableClient } from './BorrowTableClient'

export async function BorrowTableServer() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: ['borrowProducts'],
    queryFn: loadBorrowProducts,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BorrowTableClient />
    </HydrationBoundary>
  )
}
