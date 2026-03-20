'use client'

import { useCallback, useState, useTransition } from 'react'

import { Address } from 'viem'

import { loadUserBorrowPositions, loadUserSupplyPositions } from '@/app/actions'
import { UserPosition } from '@/types'

export function useLoadUserPositions(userAddresses: Address[]) {
  const [userPositions, setUserPositions] = useState<UserPosition>({
    supply: {},
    borrow: {},
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const fetchUserPositions = useCallback(() => {
    startTransition(async () => {
      try {
        const supply = await loadUserSupplyPositions(userAddresses)
        const borrow = await loadUserBorrowPositions(userAddresses)
        setUserPositions({
          supply,
          borrow,
        })
        setError(null)
      } catch (err) {
        console.error(err)
        setError('Erreur lors du chargement des positions')
      }
    })
  }, [userAddresses])

  return { userPositions, fetchUserPositions, isPending, error }
}
