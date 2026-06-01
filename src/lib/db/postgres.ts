import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import { requireDatabaseUrl } from './env'
import * as schema from './schema'

// neon-http: stateless HTTP driver, ideal for Vercel serverless (no socket pool to leak).
// Each statement is a single round trip; fine for our upserts, INSERT…SELECT, and reads.
const sqlClient = neon(requireDatabaseUrl())

export const db = drizzle(sqlClient, { schema })
export { schema }
