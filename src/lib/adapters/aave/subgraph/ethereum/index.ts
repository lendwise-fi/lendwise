import { createClient, cacheExchange, fetchExchange } from '@urql/core'
import { MarketStats } from '@/types/lending'
import { GET_MARKET_STATS } from './queries'
import { AaveMarket, AaveMarketRate } from './types'

const AAVE_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/messari/aave-v3-ethereum'

const client = createClient({
  url: AAVE_SUBGRAPH_URL,
  exchanges: [cacheExchange, fetchExchange],
})

async function getMarketStats(): Promise<MarketStats[]> {
  const { data } = await client.query(GET_MARKET_STATS, {}).toPromise()

  if (!data || !data.markets) {
    return []
  }

  return data.markets.map((m: AaveMarket) => {
    const supply = m.rates.find((r: AaveMarketRate) => r.side === 'LENDER')
    const borrow = m.rates.find((r: AaveMarketRate) => r.side === 'BORROWER')

    return {
      protocol: 'aave',
      assetSymbol: m.inputToken.symbol,
      tvl: Number(m.totalValueLockedUSD),
      supplyApy: Number(supply?.rate ?? 0),
      borrowApy: Number(borrow?.rate ?? 0),
    }
  })
}

export const ethereumAdapter = {
  getMarketStats,
}
