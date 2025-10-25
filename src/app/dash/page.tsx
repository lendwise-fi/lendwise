import PoolsTable from '@/components/PoolsTable'
import UserPositions from '@/components/UserPositions'
import { getMarketStats } from '@/hooks/useMarketStats'

export default async function DashboardPage() {
  // Server-side fetch des pools/markets via subgraph
  const markets = await getMarketStats()

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">DeFi Dashboard</h1>
      <h2 className="text-xl font-semibold mt-6">Markets / Pools</h2>
      <PoolsTable markets={markets} />
      <h2 className="text-xl font-semibold mt-10">Your Positions</h2>
      <UserPositions /> {/* Client Component */}
    </div>
  )
}
