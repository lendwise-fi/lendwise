'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useProtocolData } from '@/hooks/useProtocolData'

const supportedChains = [
  { id: 1, name: 'Ethereum' },
  { id: 42161, name: 'Arbitrum' },
]

export function ProtocolDataView() {
  const { address } = useAccount()
  const [selectedChainId, setSelectedChainId] = useState(1)

  const { positions, stats, loading } = useProtocolData(address, selectedChainId)

  if (!address) {
    return <p>Please connect your wallet.</p>
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Protocol Data</h1>

      <div className="mb-4">
        <label htmlFor="chain-select" className="mr-2">Select Blockchain:</label>
        <select
          id="chain-select"
          value={selectedChainId}
          onChange={(e) => setSelectedChainId(Number(e.target.value))}
          className="p-2 border rounded"
        >
          {supportedChains.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Loading data...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-semibold mb-2">Your Positions</h2>
            <pre className="bg-muted p-2 rounded text-sm overflow-auto">
              {JSON.stringify(positions, null, 2)}
            </pre>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2">Market Stats for {supportedChains.find(c => c.id === selectedChainId)?.name}</h2>
            <pre className="bg-muted p-2 rounded text-sm overflow-auto">
              {JSON.stringify(stats, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
