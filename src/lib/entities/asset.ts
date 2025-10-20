export interface Asset {
  symbol: string
  name: string
  price_usd: number
  market_cap?: number
  volatility_score?: number
  liquidity_score?: number
  logo_url?: string
}

const mockAssets: Asset[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    price_usd: 2500,
    market_cap: 300000000000,
    volatility_score: 6,
    liquidity_score: 10
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    price_usd: 1.0,
    market_cap: 25000000000,
    volatility_score: 1,
    liquidity_score: 10
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    price_usd: 1.0,
    market_cap: 95000000000,
    volatility_score: 1,
    liquidity_score: 10
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    price_usd: 45000,
    market_cap: 8000000000,
    volatility_score: 6,
    liquidity_score: 9
  },
  {
    symbol: 'BNB',
    name: 'BNB',
    price_usd: 310,
    market_cap: 48000000000,
    volatility_score: 7,
    liquidity_score: 9
  }
]

export const Asset = {
  async list(): Promise<Asset[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([...mockAssets])
      }, 300)
    })
  },

  async get(symbol: string): Promise<Asset | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const asset = mockAssets.find(a => a.symbol === symbol)
        resolve(asset || null)
      }, 300)
    })
  }
}
