const YIELDS_API = 'https://yields.llama.fi'
const COINS_API = 'https://coins.llama.fi'

const YIELDS_CHAIN_MAP: Record<string, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum',
  base: 'Base',
  optimism: 'Optimism',
  avalanche: 'Avalanche',
  bsc: 'BSC',
  linea: 'Linea',
}

const COINS_CHAIN_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  base: 'base',
  optimism: 'optimism',
  avalanche: 'avax',
  bsc: 'bsc',
  linea: 'linea',
}

export type DefiLlamaPool = {
  pool: string
  chain: string
  project: string
  symbol: string
  underlyingTokens: string[]
}

export type DefiLlamaYieldPoint = {
  timestamp: string
  tvlUsd: number
  totalSupplyUsd: number | null
  totalBorrowUsd: number | null
  utilization: number | null
}

export type DefiLlamaPricePoint = {
  timestamp: number
  price: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url)
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await sleep(attempt === 0 ? 1000 : 3000)
    return fetchWithRetry(url, attempt + 1)
  }
  return res
}

export async function batchedMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R | null>,
  concurrency: number,
  delayMs: number
): Promise<(R | null)[]> {
  const results: (R | null)[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + concurrency < items.length) await sleep(delayMs)
  }
  return results
}

export async function fetchAaveV3Pools(): Promise<DefiLlamaPool[]> {
  const res = await fetchWithRetry(`${YIELDS_API}/pools`)
  if (!res.ok) throw new Error(`DeFiLlama /pools failed: ${res.status}`)
  const json = (await res.json()) as { data: DefiLlamaPool[] }
  return json.data.filter((p) => p.project === 'aave-v3')
}

export function findPool(
  pools: DefiLlamaPool[],
  chain: string,
  tokenAddress: string
): DefiLlamaPool | null {
  const targetChain = (YIELDS_CHAIN_MAP[chain] ?? chain).toLowerCase()
  const targetToken = tokenAddress.toLowerCase()
  return (
    pools.find(
      (p) =>
        p.chain.toLowerCase() === targetChain &&
        p.underlyingTokens.some((t) => t.toLowerCase() === targetToken)
    ) ?? null
  )
}

export async function fetchPoolYieldHistory(
  poolId: string
): Promise<DefiLlamaYieldPoint[]> {
  const res = await fetchWithRetry(`${YIELDS_API}/chart/${poolId}`)
  if (!res.ok)
    throw new Error(`DeFiLlama /chart/${poolId} failed: ${res.status}`)
  const json = (await res.json()) as { data: DefiLlamaYieldPoint[] }
  return json.data ?? []
}

export async function fetchTokenPriceHistory(
  chain: string,
  tokenAddress: string,
  startUnix: number,
  days: number
): Promise<DefiLlamaPricePoint[]> {
  const coinsChain = COINS_CHAIN_MAP[chain] ?? chain
  const key = `${coinsChain}:${tokenAddress.toLowerCase()}`
  const url = `${COINS_API}/chart/${key}?start=${startUnix}&span=${days}&period=1d`
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`DeFiLlama coins chart failed: ${res.status}`)
  const json = (await res.json()) as {
    coins: Record<string, { prices: DefiLlamaPricePoint[] }>
  }
  return json.coins[key]?.prices ?? []
}
