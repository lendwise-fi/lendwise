function hostOf(value: string | undefined): string | null {
  if (!value) return null
  return value
    .replace(/^https?:\/\//, '')
    .split(/[/:]/)[0]
    .toLowerCase()
}

/**
 * The hosts this deployment answers on, from the system variables Vercel sets
 * on every deployment — the production domain, the branch URL and the
 * deployment URL — plus localhost outside production. Extra hosts (custom
 * domains attached to a branch or project, which Vercel exposes in no
 * variable) come from `STELLAR_SIGN_IN_EXTRA_HOSTS`, comma-separated. Only
 * hosts this deployment actually answers on may be listed there.
 *
 * Both wallet sign-ins (Stellar SEP-10 and Sign-In With Solana) bind their
 * challenge to the host the request reached, and only trust that host when it
 * is in this set; their routes also check a request's `Origin` against it
 * (same-origin.ts).
 */
export function allowedDomains(): Set<string> {
  const hosts = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
    ...(process.env.STELLAR_SIGN_IN_EXTRA_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim()),
  ].map(hostOf)
  if (process.env.NODE_ENV !== 'production')
    hosts.push('localhost', '127.0.0.1')
  return new Set(hosts.filter((h): h is string => !!h))
}
