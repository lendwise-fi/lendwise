import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query'

import { loadLendingMarkets } from '@/app/actions/markets.actions'

import { LendingTableClient } from './LendingTableClient'

export async function LendingTableServer() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: ['lendingMarkets'],
    queryFn: loadLendingMarkets,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LendingTableClient />
    </HydrationBoundary>
  )
}
