import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatAddress = (address: string): string => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function generateSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

// Helper function to convert BigInt to string for JSON serialization
export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  )
}

// ============================================================================
// APR/APY Conversion Functions
// ============================================================================

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60

/**
 * AAVE: Compounding every second
 * APY = (1 + APR/seconds_per_year)^seconds_per_year - 1
 */
export function aprToApyAave(apr: number): number {
  return Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1
}

/**
 * AAVE: Compounding every second (inverse)
 * APR = seconds_per_year * ((1 + APY)^(1/seconds_per_year) - 1)
 */
export function apyToAprAave(apy: number): number {
  return SECONDS_PER_YEAR * (Math.pow(1 + apy, 1 / SECONDS_PER_YEAR) - 1)
}

/**
 * MORPHO: Continuous compounding
 * APY = e^APR - 1
 */
export function aprToApyMorpho(apr: number): number {
  return Math.exp(apr) - 1
}

/**
 * MORPHO: Continuous compounding (inverse)
 * APR = ln(1 + APY)
 */
export function apyToAprMorpho(apy: number): number {
  return Math.log(1 + apy)
}
