import { KAMINO_PROVIDER } from '../common/config'

/**
 * `kamino:v1:solana:reserve:<market>:<reserve>:<supply|borrow>` — base58 case
 * kept (addresses are case-sensitive).
 */
export function buildProductId(
  market: string,
  reserve: string,
  kind: 'supply' | 'borrow'
): string {
  return `${KAMINO_PROVIDER}:v1:solana:reserve:${market}:${reserve}:${kind}`
}
