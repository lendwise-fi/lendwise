import { getCurrencyByCode } from '@/config/currencies'

/**
 * Get appropriate number of significant digits based on amount size
 */
function getSignificantDigitsConfig(amount: number): {
  minimumFractionDigits: number
  maximumFractionDigits: number
} {
  const absAmount = Math.abs(amount)

  // For very small numbers (< 0.01), use significant digits to show leading zeros
  if (absAmount > 0 && absAmount < 0.001) {
    return {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6, // Show up to 8 decimals for very small numbers
    }
  }

  if (absAmount > 0 && absAmount < 0.01) {
    return {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3, // Show up to 8 decimals for very small numbers
    }
  }

  // For small numbers (< 1), show up to 4 decimals
  if (absAmount < 1) {
    return {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }
  }

  // For normal numbers, show 2 decimals
  return {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }
}

/**
 * Format a number as currency using Intl.NumberFormat
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  options?: Intl.NumberFormatOptions
): string {
  const currency = getCurrencyByCode(currencyCode)
  const digitsConfig = getSignificantDigitsConfig(amount)

  // Merge options, but preserve smart decimal config for small numbers
  // unless explicitly overridden
  const mergedOptions = {
    ...digitsConfig,
    ...options,
  }

  // For small numbers with compact notation, don't use compact
  // because it will round to 0.00
  if (options?.notation === 'compact' && Math.abs(amount) < 1) {
    delete mergedOptions.notation
  }

  // For crypto currencies or unknown currencies, we don't use currency style
  if (currency?.type === 'crypto' || !currency) {
    return new Intl.NumberFormat('en-US', mergedOptions).format(amount)
  }

  // For fiat currencies, use currency style
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    ...mergedOptions,
  }).format(amount)
}

/**
 * Format a compact currency amount (e.g., 1.2K, 3.4M)
 */
export function formatCompactCurrency(
  amount: number,
  currencyCode: string
): string {
  const currency = getCurrencyByCode(currencyCode)

  if (currency?.type === 'crypto' || !currency) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}
