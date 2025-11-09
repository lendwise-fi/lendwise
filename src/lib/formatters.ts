import { formatUnits } from 'viem'

/**
 * Token Formatting Utilities
 * Handles conversion and formatting of ERC20 token amounts
 */

/**
 * Format any ERC20 token amount with smart decimal handling
 * @param amount - Token amount in smallest unit (wei-like)
 * @param decimals - Number of decimals for the token
 * @param symbol - Token symbol to display
 * @returns Formatted string with token symbol
 */
export const formatToken = (
  amount: bigint,
  decimals: number,
  symbol: string
): string => {
  const formatted = formatUnits(amount, decimals)

  if (formatted === '0') return '0'

  const numValue = Number(formatted)

  if (numValue < 0.0001) {
    return `${numValue.toFixed(6)} ${symbol}`
  }

  if (numValue < 1) {
    return `${numValue.toFixed(4)} ${symbol}`
  }

  if (numValue >= 1000000) {
    return `${(numValue / 1000000).toFixed(4)}M ${symbol}`
  }

  if (numValue >= 1000) {
    return `${(numValue / 1000).toFixed(4)}K ${symbol}`
  }

  return `${numValue.toFixed(4)} ${symbol}`
}
