import { defineConfig } from 'drizzle-kit'

import { requireDirectDatabaseUrl } from './src/lib/db/env'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: requireDirectDatabaseUrl() },
})
