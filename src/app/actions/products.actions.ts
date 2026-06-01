'use server'

import { unstable_cache } from 'next/cache'

import { getProtocolAdapter, getProtocolIds } from '@/config/protocols'
import { apyEnrichments, latestHourlyNet } from '@/lib/db/repositories/apy'
import { BorrowProduct, SupplyProduct } from '@/types'

async function _loadSupplyProducts(): Promise<SupplyProduct[]> {
  const protocolIds = getProtocolIds()

  const results = await Promise.allSettled(
    protocolIds.map(async (protocolId) => {
      const adapterLoader = getProtocolAdapter(protocolId)
      if (!adapterLoader) throw new Error(`No adapter found for ${protocolId}`)

      const protocolAdapter = await adapterLoader()
      return protocolAdapter.getSupplyProducts()
    })
  )

  const allSupplyProducts: SupplyProduct[] = []

  results.forEach((result, index) => {
    const protocolId = protocolIds[index]
    if (result.status === 'fulfilled') {
      allSupplyProducts.push(...result.value)
    } else {
      console.error(`Adapter ${protocolId} failed:`, result.reason)
    }
  })

  // Enrich with APY data from Postgres (all horizons)
  const productIds = allSupplyProducts
    .map((p) => p.productId)
    .filter(Boolean) as string[]

  const [enrichments, latestHourly] = await Promise.all([
    apyEnrichments(productIds),
    latestHourlyNet(productIds),
  ])

  const enriched = allSupplyProducts.map((p) => {
    if (!p.productId) return p
    const e = enrichments.get(p.productId)
    return {
      ...p,
      apy: latestHourly.get(p.productId) ?? p.apy,
      apyDaily: e?.apyDaily,
      apyMonthly: e?.apyMonthly,
      apyYearly: e?.apyYearly,
    }
  })

  return enriched.sort((a, b) => b.apy - a.apy)
}

export const loadSupplyProducts = unstable_cache(
  _loadSupplyProducts,
  ['supplying-markets'],
  { revalidate: 60, tags: ['supplying-markets'] }
)

async function _loadBorrowProducts(): Promise<BorrowProduct[]> {
  const protocolIds = getProtocolIds()

  const results = await Promise.allSettled(
    protocolIds.map(async (protocolId) => {
      const adapterLoader = getProtocolAdapter(protocolId)
      if (!adapterLoader) throw new Error(`No adapter found for ${protocolId}`)

      const protocolAdapter = await adapterLoader()
      return protocolAdapter.getBorrowProducts()
    })
  )

  const allBorrowProducts: BorrowProduct[] = []

  results.forEach((result, index) => {
    const protocolId = protocolIds[index]
    if (result.status === 'fulfilled') {
      allBorrowProducts.push(...result.value)
    } else {
      console.error(`Adapter ${protocolId} failed:`, result.reason)
    }
  })

  // Enrich with APY data from Postgres (all horizons)
  const productIds = allBorrowProducts
    .map((p) => p.productId)
    .filter(Boolean) as string[]

  const [enrichments, latestHourly] = await Promise.all([
    apyEnrichments(productIds),
    latestHourlyNet(productIds),
  ])

  const enriched = allBorrowProducts.map((p) => {
    if (!p.productId) return p
    const e = enrichments.get(p.productId)
    return {
      ...p,
      apy: latestHourly.get(p.productId) ?? p.apy,
      apyDaily: e?.apyDaily,
      apyMonthly: e?.apyMonthly,
      apyYearly: e?.apyYearly,
    }
  })

  return enriched.sort((a, b) => b.apy - a.apy)
}

export const loadBorrowProducts = unstable_cache(
  _loadBorrowProducts,
  ['borrowProducts'],
  { revalidate: 60, tags: ['borrowProducts'] }
)
