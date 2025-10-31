/**
 * Mapping of token symbols to their decimal places
 * Most ERC-20 tokens use 18 decimals, but some use different values
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  // Standard 18 decimals (most ERC-20 tokens)
  ETH: 18,
  WETH: 18,
  DAI: 18,
  LINK: 18,
  UNI: 18,
  AAVE: 18,
  CRV: 18,
  MKR: 18,
  SNX: 18,
  COMP: 18,
  SUSHI: 18,
  YFI: 18,
  BAL: 18,
  LDO: 18,
  RPL: 18,
  MATIC: 18,
  ARB: 18,
  OP: 18,
  FRAX: 18,
  LUSD: 18,
  SUSD: 18,
  USDE: 18,

  // Liquid staking tokens (18 decimals)
  STETH: 18,
  RETH: 18,
  CBETH: 18,
  WSTETH: 18,

  // 8 decimals
  WBTC: 8,

  // 6 decimals (common for stablecoins)
  USDC: 6,
  USDT: 6,

  // Default fallback is 18
}

/**
 * Get the number of decimals for a token
 * @param symbol Token symbol (e.g., 'USDC', 'WETH')
 * @returns Number of decimals (defaults to 18 if not found)
 */
export function getTokenDecimals(symbol: string): number {
  return TOKEN_DECIMALS[symbol.toUpperCase()] || 18
}

/**
 * Convert from smallest unit (wei/satoshi) to token amount
 * @param amount Amount in smallest unit (BigInt or number)
 * @param symbol Token symbol
 * @returns Token amount as number
 */
export function fromSmallestUnit(
  amount: bigint | number,
  symbol: string
): number {
  const decimals = getTokenDecimals(symbol)
  const numAmount = typeof amount === 'bigint' ? Number(amount) : amount
  return numAmount / 10 ** decimals
}

/**
 * Mapping of common crypto asset symbols to CoinGecko IDs
 * This is used to fetch prices from CoinGecko API
 */
export const ASSET_TO_COINGECKO_ID: Record<string, string> = {
  // Ethereum and wrapped versions
  ETH: 'ethereum',
  WETH: 'ethereum',

  // Bitcoin
  BTC: 'bitcoin',
  WBTC: 'bitcoin',

  // Stablecoins
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  USDE: 'ethena-usde',
  SUSD: 'nusd',
  FRAX: 'frax',
  LUSD: 'liquity-usd',

  // Other major tokens
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  CRV: 'curve-dao-token',
  MKR: 'maker',
  SNX: 'havven',
  COMP: 'compound-governance-token',
  SUSHI: 'sushi',
  YFI: 'yearn-finance',
  BAL: 'balancer',
  LDO: 'lido-dao',
  RPL: 'rocket-pool',
  MATIC: 'matic-network',
  ARB: 'arbitrum',
  OP: 'optimism',

  // Liquid staking tokens
  STETH: 'staked-ether',
  RETH: 'rocket-pool-eth',
  CBETH: 'coinbase-wrapped-staked-eth',
  WSTETH: 'wrapped-steth',

  // Add more as needed
}

/**
 * Get CoinGecko ID from asset symbol
 */
export function getCoinGeckoId(assetSymbol: string): string | undefined {
  return ASSET_TO_COINGECKO_ID[assetSymbol.toUpperCase()]
}

/**
 * Get all unique CoinGecko IDs from a list of asset symbols
 */
export function getUniqueCoinGeckoIds(assetSymbols: string[]): string[] {
  const ids = new Set<string>()

  assetSymbols.forEach((symbol) => {
    const id = getCoinGeckoId(symbol)
    if (id) {
      ids.add(id)
    }
  })

  return Array.from(ids)
}

/**
 * Map CoinGecko currency codes to our supported currency codes
 */
export function mapCurrencyToCoinGecko(currency: string): string {
  const mapping: Record<string, string> = {
    USD: 'usd',
    EUR: 'eur',
    GBP: 'gbp',
    JPY: 'jpy',
    CHF: 'chf',
    CAD: 'cad',
    AUD: 'aud',
    BTC: 'btc',
    ETH: 'eth',
  }

  return mapping[currency.toUpperCase()] || 'usd'
}
