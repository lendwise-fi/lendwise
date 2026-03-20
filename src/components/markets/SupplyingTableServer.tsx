import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query'

import { loadSupplyingMarkets } from '@/app/actions/markets.actions'

import { SupplyingTableClient } from './SupplyingTableClient'

export async function SupplyingTableServer() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: ['supplyingMarkets'],
    queryFn: loadSupplyingMarkets,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SupplyingTableClient />
    </HydrationBoundary>
  )
}
