import type { Kind } from '@/lib/db/types'
import type { MarketsApyQuery } from '@/lib/protocols/aave/v3/offchain/generated/graphql'

export function getNetworkName(chainName: string): string {
  if (chainName === 'Ethereum') {
    return chainName.replace('AaveV3Ethereum', '').toLowerCase()
  } else if (chainName === 'BSC') {
    return 'bsc'
  } else {
    return chainName.replace('AaveV3', '').toLowerCase()
  }
}

// ─── Pool ID builder ──────────────────────────────────────────────────────────
export function buildProductId(
  reserve: NonNullable<MarketsApyQuery['markets']>[number]['reserves'][number],
  kind: Kind
): string {
  // market prefix prevents collision — same token can exist on multiple AAVE markets
  // on the same chain (e.g. AaveV3Ethereum + AaveV3EthereumLido both have USDC on chain 1)
  const network = reserve.market.name.toLowerCase().replace('aavev3', '')
  const underlyingTokenAddress = reserve.underlyingToken.address.toLowerCase()
  return `aave:v3:${network}:reserve:${underlyingTokenAddress}:${kind}`
}
