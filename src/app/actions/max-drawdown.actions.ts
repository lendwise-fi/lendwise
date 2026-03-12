'use server'

import { cache } from 'react'

const FALLBACK_RESULT = {
  maxDrawdown: '0.00%',
  from: new Date(0).toISOString(),
  to: new Date(0).toISOString(),
}

export const getMaxDrawdown = cache(async function getMaxDrawdown() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365',
      { next: { revalidate: 3600 } } // met en cache 1h
    )

    if (!res.ok) {
      console.error(
        'Failed to fetch data from Coingecko: non-OK response',
        res.status,
        res.statusText
      )
      return FALLBACK_RESULT
    }

    const data = await res.json()

    const prices: [number, number][] = data.prices
    if (!prices?.length) {
      console.error('No price data found in Coingecko response')
      return FALLBACK_RESULT
    }

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
  } catch (error) {
    console.error('Failed to fetch data from Coingecko', error)
    return FALLBACK_RESULT
  }
})
