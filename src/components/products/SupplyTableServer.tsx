import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query'

import { loadSupplyProducts } from '@/app/actions/products.actions'

import { SupplyTableClient } from './SupplyTableClient'

export async function SupplyTableServer() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: ['supplyProducts'],
    queryFn: loadSupplyProducts,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SupplyTableClient />
    </HydrationBoundary>
  )
}
