import { LendingPosition } from '@/types/lending'

export default function PositionsTable({ data }: { data: LendingPosition[] }) {
  if (data.length === 0) return <p>No positions found.</p>

  return (
    <table className="w-full border-collapse border border-border">
      <thead>
        <tr>
          <th className="border p-2">Protocol</th>
          <th className="border p-2">Asset</th>
          <th className="border p-2">Supplied</th>
          <th className="border p-2">Borrowed</th>
          <th className="border p-2">Supply APY</th>
          <th className="border p-2">Borrow APY</th>
        </tr>
      </thead>
      <tbody>
        {data.map((pos) => (
          <tr key={`${pos.protocol}-${pos.assetSymbol}`}>
            <td className="border p-2">{pos.protocol}</td>
            <td className="border p-2">{pos.assetSymbol}</td>
            <td className="border p-2">{pos.supplied.toString()}</td>
            <td className="border p-2">{pos.borrowed.toString()}</td>
            <td className="border p-2">{pos.apySupply.toFixed(2)}%</td>
            <td className="border p-2">{pos.apyBorrow.toFixed(2)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
