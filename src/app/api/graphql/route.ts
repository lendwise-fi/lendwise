import { createYoga } from 'graphql-yoga'

import { schema } from '@/lib/graphql/schema'

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  // Next.js App Router uses Web Request/Response objects by default
  fetchAPI: { Request, Response },
})

export { yoga as GET, yoga as OPTIONS, yoga as POST }
