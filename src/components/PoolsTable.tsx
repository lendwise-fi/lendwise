import { MarketStats } from '@/types/lending'

export default function PoolsTable({ markets }: { markets: MarketStats[] }) {
  return (
    <table className="w-full border-collapse border border-border">
      <thead>
        <tr>
          <th className="border p-2">Protocol</th>
          <th className="border p-2">Asset</th>
          <th className="border p-2">TVL</th>
          <th className="border p-2">Supply APY</th>
          <th className="border p-2">Borrow APY</th>
        </tr>
      </thead>
      <tbody>
        {markets.map((m) => (
          <tr key={`${m.protocol}-${m.assetSymbol}`}>
            <td className="border p-2">{m.protocol}</td>
            <td className="border p-2">{m.assetSymbol}</td>
            <td className="border p-2">${m.tvl.toLocaleString()}</td>
            <td className="border p-2">{m.supplyApy.toFixed(2)}%</td>
            <td className="border p-2">{m.borrowApy.toFixed(2)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
