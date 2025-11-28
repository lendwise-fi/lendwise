import { HealthFactorBarDemo } from '@/components/borrowing/HealthFactorBarDemo'

import { getMaxDrawdown } from '../actions/max-drawdown.actions'

export default async function Page() {
  const result = await getMaxDrawdown()

  return (
    <main className="space-y-3 p-6">
      <h1 className="text-xl font-bold">BTC Max Drawdown (1 an)</h1>
      <p>Drawdown : {result.maxDrawdown}</p>
      <p>
        Période : {new Date(result.from).toLocaleDateString()} →{' '}
        {new Date(result.to).toLocaleDateString()}
      </p>
      <HealthFactorBarDemo />
    </main>
  )
}
