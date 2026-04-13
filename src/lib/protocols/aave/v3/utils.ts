import type { Kind } from '@/lib/db/types'
import type { MarketsApyQuery } from '@/lib/protocols/aave/v3/offchain/generated/graphql'
import { CHAIN_NAME_MAPPING } from '@/lib/protocols/utils'

export function getNetworkName(chainName: string): string {
    if (['AaveV3EthereumEtherFi', 'AaveV3EthereumHorizon', 'AaveV3EthereumLido'].includes(chainName)) {
        return chainName.replace('AaveV3Ethereum', '').toLowerCase()
    } else if (chainName === 'AaveV3BNB') {
        return 'bsc'
    } else {
        return chainName.replace('AaveV3', '').toLowerCase()
    }
}

// ─── Primitive Product ID builder ─────────────────────────────────────────────────────

export function buildReserveProductId(
    chainId: number,
    tokenAddress: string,
    kind: Kind
): string {
    const network = CHAIN_NAME_MAPPING[chainId] ?? String(chainId)
    return `aave:v3:${network}:reserve:${tokenAddress.toLowerCase()}:${kind}`
}

// ─── Pool ID builder ──────────────────────────────────────────────────────────────
export function buildProductId(
    reserve: NonNullable<MarketsApyQuery['markets']>[number]['reserves'][number],
    kind: Kind
): string {
    // market prefix prevents collision — same token can exist on multiple AAVE markets
    // on the same chain (e.g. AaveV3Ethereum + AaveV3EthereumLido both have USDC on chain 1)
    return buildReserveProductId(
        reserve.market.chain.chainId,
        reserve.underlyingToken.address,
        kind
    )
}
