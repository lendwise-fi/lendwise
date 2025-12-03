// import { LendingMarkets } from '@/components/dashboard/lending'
import { loadLendingMarkets } from '@/app/actions/markets.actions'
import { LendingTable } from '@/components/markets/LendingTable'

export default async function LendingPage() {
  const lendingMarkets = await loadLendingMarkets()

  return (
    <div className="flex-1 space-y-8 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-foreground mb-2 text-3xl font-bold">
            Lending pools
          </h1>
          <p className="text-muted-foreground-400">
            All available lending pools across protocols and chains
          </p>
        </div>
      </div>

      <div className="">
        <LendingTable data={Object.values(lendingMarkets).flat()} />
      </div>
    </div>
  )
}
