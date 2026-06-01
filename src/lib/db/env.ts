/** Reads + validates the Postgres connection env. Throws early on misconfig. */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url)
    throw new Error('Invalid/Missing environment variable: "DATABASE_URL"')
  return url
}

export function requireDirectDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  if (!url)
    throw new Error(
      'Invalid/Missing environment variable: "DATABASE_URL_UNPOOLED"'
    )
  return url
}
