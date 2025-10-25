'use client'
import { useAccount } from 'wagmi'
import { usePositions } from '@/hooks/usePositions'
import PositionsTable from './PositionsTable'

export default function UserPositions() {
  const { address, isConnected } = useAccount()
  const positions = usePositions(address as `0x${string}`)

  if (!isConnected) return <p>Connect your wallet to see your positions.</p>
  if (!positions) return <p>Loading positions...</p>

  return <PositionsTable data={positions} />
}
