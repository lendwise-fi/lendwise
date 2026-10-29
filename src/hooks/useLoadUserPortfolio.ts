'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { loadUserPortfolio } from '@/app/actions'
import { PORTFOLIO_REFRESH_EVENT } from '@/lib/portfolio/refresh-event'
import {
  type PortfolioWalletInput,
  type UserPortfolioResult,
  emptyPortfolio,
  isPortfolioRateLimited,
} from '@/lib/portfolio/types'

export function useLoadUserPortfolio(wallets: PortfolioWalletInput[]) {
  const [portfolio, setPortfolio] =
    useState<UserPortfolioResult>(emptyPortfolio)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Only the latest load is shown: an older one finishing last would
  // overwrite the portfolio of the current wallet list.
  const latest = useRef(0)

  const fetchPortfolio = useCallback(() => {
    const id = ++latest.current
    startTransition(async () => {
      try {
        const result = await loadUserPortfolio(wallets)
        if (id !== latest.current) return
        // Over the per-IP limit: shown like a failed load, the last read kept.
        if (isPortfolioRateLimited(result)) {
          setError(result.error)
          return
        }
        setPortfolio(result)
        setError(null)
      } catch (err) {
        if (id !== latest.current) return
        console.error(err)
        setError('Erreur lors du chargement des positions')
      }
    })
  }, [wallets])

  // A bridge transfer that lands asks every mounted portfolio to reload.
  useEffect(() => {
    const onRefresh = () => fetchPortfolio()
    window.addEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh)
  }, [fetchPortfolio])

  return { portfolio, fetchPortfolio, isPending, error }
}
