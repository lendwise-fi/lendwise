'use client'

import { useCallback, useState, useTransition } from 'react'

import { loadUserPortfolioPositions } from '@/app/actions'
import type {
  PortfolioPartialFailure,
  PortfolioWalletInput,
} from '@/lib/portfolio/types'
import { EMPTY_USER_POSITIONS } from '@/lib/portfolio/types'
import type { UserPosition } from '@/types'

export function useLoadUserPositions(wallets: PortfolioWalletInput[]) {
  const [userPositions, setUserPositions] =
    useState<UserPosition>(EMPTY_USER_POSITIONS)
  const [partialFailures, setPartialFailures] = useState<
    PortfolioPartialFailure[]
  >([])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const fetchUserPositions = useCallback(() => {
    startTransition(async () => {
      try {
        const result = await loadUserPortfolioPositions(wallets)
        setUserPositions(result.positions)
        setPartialFailures(result.failures)
        setError(null)
      } catch (err) {
        console.error(err)
        setError('Erreur lors du chargement des positions')
      }
    })
  }, [wallets])

  return {
    userPositions,
    fetchUserPositions,
    isPending,
    error,
    partialFailures,
  }
}
