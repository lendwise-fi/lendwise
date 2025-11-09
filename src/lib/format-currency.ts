import { getCurrencyByCode } from '@/config/currencies'

/**
 * Currency formatting and conversion utilities
 * 
 * For currency conversion, use the useCurrency() hook:
 * const { rate, convertFromUSD, formatValue } = useCurrency()
 * 
 * For inline conversions in components:
 * const { rate } = useCurrency()
 * const converted = usdValue * rate
 */

/**
 * Simple utility to convert a USD value to target currency
 * @param usdValue - Value in USD
 * @param rate - Conversion rate (from useCurrency hook)
 * @returns Converted value
 */
export function convertValue(usdValue: number, rate: number): number {
  return usdValue * rate
}

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
 * For crypto currencies, handles very small amounts with appropriate precision
 */
export function formatCompactCurrency(
  amount: number,
  currencyCode: string
): string {
  const currency = getCurrencyByCode(currencyCode)
  const absAmount = Math.abs(amount)

  // For crypto currencies, handle small amounts differently
  if (currency?.type === 'crypto' || !currency) {
    // Get crypto symbol
    const symbol = currencyCode === 'BTC' ? '₿' : currencyCode === 'ETH' ? 'Ξ' : currencyCode
    
    let formatted: string
    
    // For very small amounts, don't use compact notation and show more decimals
    if (absAmount > 0 && absAmount < 0.01) {
      formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8, // Show up to 8 decimals for very small crypto amounts
      }).format(amount)
    }
    // For amounts less than 1, show more precision
    else if (absAmount < 1) {
      formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }).format(amount)
    }
    // For larger amounts, use compact notation
    else {
      formatted = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount)
    }
    
    return `${symbol}${formatted}`
  }

  // For fiat currencies, always use compact notation
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}
