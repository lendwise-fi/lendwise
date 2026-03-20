import type { Kind } from '@/lib/db/types'

// ─── Pool ID builder ──────────────────────────────────────────────────────────
export function buildProductId(
  marketId: string,
  chain: { id: number; name: string },
  kind: Kind
): string {
  // market prefix prevents collision — same token can exist on multiple Compound markets
  // on the same chain (e.g. different versions or deployments)
  return `compoundcomet:v3:${chain.name}:market:${marketId}:${kind}`
}
