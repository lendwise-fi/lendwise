'use server'

import { cache } from 'react'

import { Address } from 'viem'

import { getProtocolAdapter } from '@/config/protocols'
import type { MarketRate, TimeframeLabel } from '@/types'

/**
 * Parameters for loading market rates
 */
export interface LoadMarketRateParams {
  protocolId: string
  chainId: number
  poolId: string
  tokenId: Address
  interval: TimeframeLabel
  fromTimestamp: number
}

/**
 * Load market borrow rates for a specific pool and timeline
 * @param params - Parameters including timeline, fromTimestamp, and poolId
 * @returns Array of market rates with timestamp and rate
 */
export const loadMarketBorrowHistoryRates = cache(async function loadMarketRate(
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

    const rates = await protocolAdapter.getMarketBorrowHistoryRates({
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
export const loadMarketLendHistoryRates = cache(async function loadMarketRate(
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

    const rates = await protocolAdapter.getMarketLendHistoryRates({
      chainId,
      poolId,
      interval,
      fromTimestamp,
      tokenId,
    })

    return rates
  } catch (err) {
    console.error('Error loading market rates:', err)
    return []
  }
})
