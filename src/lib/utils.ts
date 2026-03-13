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

/**
 * Normalize a timestamp to the nearest 10-minute slot boundary (UTC).
 * The job may run at 13:17:42Z — the slot is always 13:10:00.000Z.
 * This ensures idempotent upserts regardless of job execution delay.
 */
export function normalizeSlotTimestamp(date: Date = new Date()): Date {
  const d = new Date(date)
  d.setUTCSeconds(0, 0)
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10)
  return d
}

// ─── APR / APY conversion ─────────────────────────────────────────────────────

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60

/**
 * AAVE: per-second compounding.
 * APY = (1 + APR / seconds_per_year)^seconds_per_year - 1
 *
 * Used for AAVE base rates and AAVE native incentive APRs.
 */
export function aprToApyAave(apr: number): number {
  if (apr <= 0) return 0
  return Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1
}

/**
 * AAVE: per-second compounding (inverse).
 * APR = seconds_per_year * ((1 + APY)^(1/seconds_per_year) - 1)
 */
export function apyToAprAave(apy: number): number {
  if (apy <= 0) return 0
  return SECONDS_PER_YEAR * (Math.pow(1 + apy, 1 / SECONDS_PER_YEAR) - 1)
}

/**
 * Morpho: continuous compounding.
 * APY = e^APR - 1
 *
 * Used for Morpho reward APRs (state.rewards[].supplyApr / borrowApr).
 */
export function aprToApyMorpho(apr: number): number {
  if (apr <= 0) return 0
  return Math.exp(apr) - 1
}

/**
 * Morpho: continuous compounding (inverse).
 * APR = ln(1 + APY)
 */
export function apyToAprMorpho(apy: number): number {
  if (apy <= 0) return 0
  return Math.log(1 + apy)
}

/**
 * Merkl / unknown source: daily compounding (n=365).
 * APY = (1 + APR / 365)^365 - 1
 *
 * Conservative fallback when the compounding model of the source is unknown.
 * Used for Merkl campaign APRs and Merit program APRs.
 */
export function aprToApyDaily(apr: number): number {
  if (apr <= 0) return 0
  return Math.pow(1 + apr / 365, 365) - 1
}
