import { BridgeUsdcToStellar } from '@/components/bridge/BridgeUsdcToStellar'

export default async function StellarBridgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const amount = Array.isArray(params.amount) ? params.amount[0] : params.amount
  const asset = Array.isArray(params.asset) ? params.asset[0] : params.asset
  const source = Array.isArray(params.source) ? params.source[0] : params.source

  return (
    <BridgeUsdcToStellar
      initialAmount={amount}
      initialAsset={asset}
      initialSource={source}
    />
  )
}
