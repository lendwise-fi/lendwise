import { useEffect, useState } from 'react'
import { useAccount, usePublicClient, useChainId } from 'wagmi'
import { Address } from 'viem'
import { Position, UserPositionSummary, ProtocolName } from '@/types/defi'
import { PositionAggregatorService } from '@/services/position-aggregator.service'

interface UsePositionsResult {
  positions: Position[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch all positions across all protocols for the connected wallet
 */
export function usePositions(): UsePositionsResult {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchPositions = async () => {
    if (!address || !publicClient || !chainId) {
      setPositions([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const aggregator = new PositionAggregatorService(publicClient, chainId)
      const userPositions = await aggregator.getAllPositions(address)
      setPositions(userPositions)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch positions'))
      console.error('Error fetching positions:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPositions()
  }, [address, publicClient, chainId])

  return {
    positions,
    loading,
    error,
    refetch: fetchPositions,
  }
}

interface UsePositionSummaryResult {
  summary: UserPositionSummary | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch a comprehensive summary of user's positions
 */
export function usePositionSummary(): UsePositionSummaryResult {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  
  const [summary, setSummary] = useState<UserPositionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchSummary = async () => {
    if (!address || !publicClient || !chainId) {
      setSummary(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const aggregator = new PositionAggregatorService(publicClient, chainId)
      const userSummary = await aggregator.getUserSummary(address)
      setSummary(userSummary)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch summary'))
      console.error('Error fetching summary:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSummary()
  }, [address, publicClient, chainId])

  return {
    summary,
    loading,
    error,
    refetch: fetchSummary,
  }
}

interface UseProtocolPositionsResult {
  positions: Position[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch positions from a specific protocol
 */
export function useProtocolPositions(protocol: ProtocolName): UseProtocolPositionsResult {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchPositions = async () => {
    if (!address || !publicClient || !chainId) {
      setPositions([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const aggregator = new PositionAggregatorService(publicClient, chainId)
      const protocolPositions = await aggregator.getProtocolPositions(protocol, address)
      setPositions(protocolPositions)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(`Failed to fetch ${protocol} positions`))
      console.error(`Error fetching ${protocol} positions:`, err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPositions()
  }, [protocol, address, publicClient, chainId])

  return {
    positions,
    loading,
    error,
    refetch: fetchPositions,
  }
}

interface UseOpportunitiesResult {
  opportunities: Array<{
    type: 'higher-yield' | 'lower-borrow-rate' | 'health-warning'
    title: string
    description: string
    currentAPY?: number
    betterAPY?: number
    position?: Position
  }>
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook to find yield optimization opportunities
 */
export function useOpportunities(): UseOpportunitiesResult {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  
  const [opportunities, setOpportunities] = useState<UseOpportunitiesResult['opportunities']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchOpportunities = async () => {
    if (!address || !publicClient || !chainId) {
      setOpportunities([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const aggregator = new PositionAggregatorService(publicClient, chainId)
      const opps = await aggregator.findOpportunities(address)
      setOpportunities(opps)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch opportunities'))
      console.error('Error fetching opportunities:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOpportunities()
  }, [address, publicClient, chainId])

  return {
    opportunities,
    loading,
    error,
    refetch: fetchOpportunities,
  }
}
