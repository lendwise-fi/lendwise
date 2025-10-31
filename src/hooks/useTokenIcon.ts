'use client'

import useSWR from 'swr'

/**
 * Fetcher function for SWR
 * Checks localStorage first, then fetches from API
 */
async function fetchCoinIcon(symbol: string): Promise<string | null> {
  const key = `token-icon-${symbol.toLowerCase()}`

  // Check localStorage cache
  const cached = localStorage.getItem(key)
  if (cached) return cached

  // Fetch from API
  try {
    const response = await fetch(`/api/token-icon?symbol=${symbol}`)

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const url = data.url

    // Store in localStorage
    if (url) {
      localStorage.setItem(key, url)
    }

    return url
  } catch (error) {
    console.error('Error fetching token icon:', error)
    return null
  }
}

/**
 * Hook to fetch and cache token icon URLs
 * Uses SWR for data fetching and localStorage for persistence
 */
export function useTokenIcon(symbol?: string) {
  const { data: icon } = useSWR(
    symbol ? ['tokenIcon', symbol.toLowerCase()] : null,
    async ([, sym]) => fetchCoinIcon(sym),
    {
      revalidateOnFocus: false,
      dedupingInterval: 1000 * 60 * 60, // 1 hour
      revalidateOnMount: true,
    }
  )

  return icon
}
