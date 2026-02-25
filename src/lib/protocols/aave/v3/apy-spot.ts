import { ApyTimeSeriesDocument } from '@/lib/db/types'
import { AAVE_CONFIG } from '@/lib/protocols/aave/config'
import { MarketsApyQuery } from '@/lib/protocols/aave/v3/offchain/generated/graphql'
import { MARKETS_APY } from '@/lib/protocols/aave/v3/offchain/queries'
import { createGraphQLClient } from '@/lib/protocols/shared'

/**
 * Shape of a single opportunity returned by the Merkl API.
 */
type MerklOpportunity = {
  chainId: number
  status: string
  action: string
  apr: number
  depositUrl?: string
  tokens: { address: string }[]
}

type MerklIncentives = {
  supply: Map<string, number>
  borrow: Map<string, number>
}

/**
 * Convert a percentage APR (e.g. 1 = 1%) to a raw APY decimal (e.g. 0.01005…)
 * using daily compounding: APY = (1 + APR/365)^365 - 1
 */
function aprPercentToApy(aprPercent: number): number {
  const aprDecimal = aprPercent / 100
  return Math.pow(1 + aprDecimal / 365, 365) - 1
}

/**
 * Extract `marketName` and `underlyingAsset` query params from a Merkl depositUrl.
 * e.g. "https://app.aave.com/reserve-overview/?underlyingAsset=0x6c3e...&marketName=proto_mainnet_v3"
 */
function extractDepositUrlParams(depositUrl?: string): {
  marketName: string | null
  underlyingAsset: string | null
} {
  if (!depositUrl) return { marketName: null, underlyingAsset: null }
  try {
    const url = new URL(depositUrl)
    return {
      marketName: url.searchParams.get('marketName'),
      underlyingAsset: url.searchParams.get('underlyingAsset'),
    }
  } catch {
    return { marketName: null, underlyingAsset: null }
  }
}

/**
 * Build a composite key for the incentive map: `marketName:tokenAddress` (lowercased).
 * If marketName is null, falls back to just `tokenAddress` for broader matching.
 */
function incentiveKey(marketName: string | null, tokenAddress: string): string {
  const addr = tokenAddress.toLowerCase()
  return marketName ? `${marketName}:${addr}` : addr
}

/**
 * Fetch Merkl incentive APR for Aave opportunities (LEND + BORROW).
 * Returns maps of composite key (marketName:tokenAddress) → incentive APY (raw decimal).
 * Merkl values are converted from percentage APR to raw APY to match Aave's format.
 */
async function fetchMerklIncentives(
  chainIds: number[]
): Promise<MerklIncentives> {
  const incentives: MerklIncentives = {
    supply: new Map(),
    borrow: new Map(),
  }

  try {
    const url = `https://api.merkl.xyz/v4/opportunities/?name=aave&chainId=${chainIds.join(',')}`
    const response = await fetch(url)

    if (!response.ok) {
      console.warn(
        `[cron:aave:merkl] Merkl API returned ${response.status}: ${response.statusText}`
      )
      return incentives
    }

    const opportunities: MerklOpportunity[] = await response.json()

    for (const opp of opportunities) {
      if (opp.status !== 'LIVE') continue

      const targetMap =
        opp.action === 'LEND'
          ? incentives.supply
          : opp.action === 'BORROW'
            ? incentives.borrow
            : null

      if (!targetMap) continue

      // Convert Merkl's percentage APR to raw APY decimal
      const incentiveApy = aprPercentToApy(opp.apr)
      const { marketName, underlyingAsset } = extractDepositUrlParams(
        opp.depositUrl
      )

      // Collect all token addresses to key: tokens array + underlyingAsset from URL
      const addresses = new Set(opp.tokens.map((t) => t.address.toLowerCase()))
      if (underlyingAsset) {
        addresses.add(underlyingAsset.toLowerCase())
      }

      for (const addr of addresses) {
        const key = incentiveKey(marketName, addr)
        // Accumulate if multiple incentive programs target the same token+market
        targetMap.set(key, (targetMap.get(key) ?? 0) + incentiveApy)
      }
    }
  } catch (err) {
    console.error(
      '[cron:aave:merkl] Failed to fetch Merkl incentives:',
      err instanceof Error ? err.message : err
    )
  }

  return incentives
}

/**
 * Map Aave GraphQL market.name to Merkl marketName slugs.
 *
 * Aave GraphQL returns programmatic names like "AaveV3Ethereum", "AaveV3EthereumLido", etc.
 * Merkl depositUrl uses slugs like "proto_mainnet_v3", "proto_lido_v3", etc.
 */
const AAVE_MARKET_TO_MERKL_SLUG: Record<string, string> = {
  // Ethereum markets
  AaveV3Ethereum: 'proto_mainnet_v3',
  AaveV3EthereumLido: 'proto_lido_v3',
  AaveV3EthereumEtherFi: 'proto_etherfi_v3',
  AaveV3EthereumHorizon: 'proto_horizon_v3',
  // L2 markets
  AaveV3Polygon: 'proto_polygon_v3',
  AaveV3Arbitrum: 'proto_arbitrum_v3',
  AaveV3Optimism: 'proto_optimism_v3',
  AaveV3Base: 'proto_base_v3',
  AaveV3Avalanche: 'proto_avalanche_v3',
  AaveV3BNB: 'proto_bnb_v3',
  AaveV3Linea: 'proto_linea_v3',
  AaveV3Gnosis: 'proto_gnosis_v3',
  AaveV3Scroll: 'proto_scroll_v3',
  AaveV3Metis: 'proto_metis_v3',
  AaveV3ZkSync: 'proto_zksync_v3',
}

/**
 * Resolve the Merkl marketName slug from an Aave market name.
 */
function resolveMarketSlug(aaveMarketName: string): string | null {
  return AAVE_MARKET_TO_MERKL_SLUG[aaveMarketName] ?? null
}

/**
 * Look up Merkl incentive APY for a given token in a specific market.
 * First tries the market-scoped key (marketName:tokenAddress),
 * then falls back to a token-only key (tokenAddress) for broader incentives.
 */
function lookupIncentive(
  map: Map<string, number>,
  marketSlug: string | null,
  tokenAddress: string
): number {
  const addr = tokenAddress.toLowerCase()
  // Try market-scoped lookup first
  if (marketSlug) {
    const scoped = map.get(`${marketSlug}:${addr}`)
    if (scoped !== undefined) return scoped
  }
  // Fallback: token-only key (for incentives without a depositUrl/marketName)
  return map.get(addr) ?? 0
}

/**
 * Fetch current supply and borrow APY for all AAVE v3 markets.
 * Enriches APY with Merkl incentive programs, scoped to specific markets.
 * Optionally filter by chain to reduce payload size.
 */
export async function fetchAaveV3Apy(
  chainFilter?: string
): Promise<ApyTimeSeriesDocument[]> {
  const config = AAVE_CONFIG.aave_v3
  const client = createGraphQLClient(config.offchainApiUrl!)

  let chainIds = Object.keys(config.chains).map(Number)

  // Filter chainIds if a specific chain is requested
  if (chainFilter) {
    const chainId = Object.entries(config.chains).find(
      ([, chainConfig]) =>
        chainConfig.name.toLowerCase() === chainFilter.toLowerCase()
    )?.[0]

    if (chainId) {
      chainIds = [Number(chainId)]
    } else {
      console.warn(
        `[cron:aave] Chain filter '${chainFilter}' not found in config`
      )
      return []
    }
  }

  // Fetch Aave APY and Merkl incentives in parallel
  const [graphqlResult, merklIncentives] = await Promise.all([
    client
      .query<MarketsApyQuery>(MARKETS_APY, {
        request: { chainIds },
      })
      .toPromise(),
    fetchMerklIncentives(chainIds),
  ])

  const { data, error } = graphqlResult

  if (error) {
    console.error('[cron:aave] Failed to fetch APY:', error.message)
    return []
  }

  if (!data?.markets) {
    return []
  }

  const snapshots: ApyTimeSeriesDocument[] = []
  const timestamp = new Date()

  for (const market of data.markets) {
    const chain = market.chain.name.toLowerCase()
    const marketSlug = resolveMarketSlug(market.name)

    for (const reserve of market.reserves) {
      // Base rates directly from Aave protocol
      const baseSupplyApy = Number(reserve.supplyInfo?.apy.value ?? 0)
      const baseBorrowApy = Number(reserve.borrowInfo?.apy.value ?? 0)

      // Calculate extra rewards (Native Aave Incentives + Merkl Incentives)
      let nativeSupplyRewards = 0
      let nativeBorrowRewards = 0

      // Extract native Aave incentives from the GraphQL response
      if (reserve.incentives) {
        for (const inc of reserve.incentives) {
          // Aave/Merit Supply Incentives
          if ('extraSupplyApr' in inc && inc.extraSupplyApr) {
            nativeSupplyRewards += aprPercentToApy(
              Number(inc.extraSupplyApr.value) * 100
            )
          } else if (
            'extraApr' in inc &&
            inc.extraApr &&
            'supplyToken' in inc
          ) {
            // MeritBorrowAndSupplyIncentiveCondition (Supply side)
            nativeSupplyRewards += aprPercentToApy(
              Number(inc.extraApr.value) * 100
            )
          }

          // Aave/Merit Borrow Incentives (Discounts)
          if ('borrowAprDiscount' in inc && inc.borrowAprDiscount) {
            nativeBorrowRewards += aprPercentToApy(
              Number(inc.borrowAprDiscount.value) * 100
            )
          } else if (
            'extraApr' in inc &&
            inc.extraApr &&
            'borrowToken' in inc
          ) {
            // MeritBorrowAndSupplyIncentiveCondition (Borrow side)
            nativeBorrowRewards += aprPercentToApy(
              Number(inc.extraApr.value) * 100
            )
          }
        }
      }

      const tokenAddress = reserve.underlyingToken.address
      const merklSupplyRewards = lookupIncentive(
        merklIncentives.supply,
        marketSlug,
        tokenAddress
      )
      const merklBorrowRewards = lookupIncentive(
        merklIncentives.borrow,
        marketSlug,
        tokenAddress
      )

      const totalSupplyRewards = nativeSupplyRewards + merklSupplyRewards
      const totalBorrowRewards = nativeBorrowRewards + merklBorrowRewards

      // Total Supply APY: Base + Rewards
      const totalSupplyApy = baseSupplyApy + totalSupplyRewards

      // Total Borrow APY: Base - Rewards (because rewards reduce your borrow cost)
      // Cap at 0 so a highly incentivized market doesn't look like negative total borrow cost
      const totalBorrowApy = Math.max(0, baseBorrowApy - totalBorrowRewards)

      const borrowAssets = Number(reserve.borrowInfo?.total.amount.value ?? 0)
      const borrowAssetsUsd = Number(reserve.borrowInfo?.total.usd ?? 0)
      const supplyAssets = Number(reserve.size.amount.value ?? 0)
      const supplyAssetsUsd = Number(reserve.size.usd ?? 0)
      const collateralAssets = 0
      const collateralAssetsUsd = 0

      snapshots.push({
        timestamp,
        metadata: {
          protocol: {
            name: market.name,
            address: market.address,
          },
          chain: {
            id: market.chain.chainId,
            name: chain,
          },
          vault: {
            symbol: reserve.underlyingToken.symbol,
            name: reserve.underlyingToken.name,
            address: reserve.underlyingToken.address,
          },
        },
        supplyApy: {
          native: baseSupplyApy,
          rewards: totalSupplyRewards,
          fees: 0, // AAVE does not have additional static supply fees beyond the reserve factor which is already subtracted from baseSupplyApy
          total: totalSupplyApy,
        },
        borrowApy: {
          native: baseBorrowApy,
          rewards: totalBorrowRewards,
          fees: 0, // AAVE has no separate borrower interest fees, the base rate is the full cost
          total: totalBorrowApy,
          protocolData: {
            variableRateSlope1: Number(
              reserve.borrowInfo?.variableRateSlope1.value ?? 0
            ),
            variableRateSlope2: Number(
              reserve.borrowInfo?.variableRateSlope2.value ?? 0
            ),
            optimalUsageRate: Number(
              reserve.borrowInfo?.optimalUsageRate.value ?? 0
            ),
            baseVariableBorrowRate: Number(
              reserve.borrowInfo?.baseVariableBorrowRate.value ?? 0
            ),
          },
        },
        supplyAssets,
        supplyAssetsUsd,
        borrowAssets,
        borrowAssetsUsd,
        collateralAssets,
        collateralAssetsUsd,
      })
    }
  }
  return snapshots
}
