'use server'

import { cache } from 'react'

import { Address } from 'viem'

import { getProtocolAdapter } from '@/config/protocols'
import type { MarketRate, MarketRateInterval } from '@/types'

/**
 * Parameters for loading market rates
 */
export interface LoadMarketRateParams {
  protocolId: string
  chainId: number
  poolId: string
  tokenId: Address
  interval: MarketRateInterval
  fromTimestamp: number
}

/**
 * Load market borrow rates for a specific pool and timeline
 * @param params - Parameters including timeline, fromTimestamp, and poolId
 * @returns Array of market rates with timestamp and rate
 */
export const loadMarketBorrowRates = cache(async function loadMarketRate(
  params: LoadMarketRateParams
): Promise<MarketRate[]> {
  const { chainId, protocolId, interval, fromTimestamp, poolId, tokenId } =
    params

  try {
    const adapterLoader = getProtocolAdapter(protocolId)
    if (!adapterLoader) {
      throw new Error(`No adapter found for protocol ${protocolId}`)
    }

    const protocolAdapter = await adapterLoader()

    const rates = await protocolAdapter.getMarketBorrowRates({
      chainId,
      poolId,
      tokenId,
      interval,
      fromTimestamp,
    })

    return rates
  } catch (err) {
    console.error('Error loading market rates:', err)
    return []
  }
})

/**
 * Load market lend rates for a specific pool and timeline
 * @param params - Parameters including timeline, fromTimestamp, and poolId
 * @returns Array of market rates with timestamp and rate
 */
export const loadMarketLendRates = cache(async function loadMarketRate(
  params: LoadMarketRateParams
): Promise<MarketRate[]> {
  const { chainId, protocolId, interval, fromTimestamp, poolId } = params

  try {
    const adapterLoader = getProtocolAdapter(protocolId)
    if (!adapterLoader) {
      throw new Error(`No adapter found for protocol ${protocolId}`)
    }

    const protocolAdapter = await adapterLoader()

    const rates = await protocolAdapter.getMarketLendRates({
      chainId,
      poolId,
      interval,
      fromTimestamp,
    })

    return rates
  } catch (err) {
    console.error('Error loading market rates:', err)
    return []
  }
})
