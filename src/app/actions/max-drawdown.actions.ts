'use server'

import { cache } from 'react'

export const getMaxDrawdown = cache(async function getMaxDrawdown() {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365',
    { next: { revalidate: 3600 } } // met en cache 1h
  )

  if (!res.ok) throw new Error('Failed to fetch data from Coingecko')
  const data = await res.json()

  const prices: [number, number][] = data.prices
  if (!prices?.length) throw new Error('No price data found')

  let peak = prices[0][1]
  let maxDrawdown = 0
  let peakTimestamp = prices[0][0]
  let troughTimestamp = prices[0][0]

  for (const [timestamp, price] of prices) {
    if (price > peak) {
      peak = price
      peakTimestamp = timestamp
    }

    const drawdown = (price - peak) / peak
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown
      troughTimestamp = timestamp
    }
  }

  return {
    maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
    from: new Date(peakTimestamp).toISOString(),
    to: new Date(troughTimestamp).toISOString(),
  }
})
