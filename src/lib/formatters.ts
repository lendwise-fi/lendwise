import { formatEther, formatUnits, parseEther, parseUnits } from 'viem'

/**
 * ETH/ERC20 Token Formatting Utilities using Viem
 * These functions handle conversion between wei and ETH/ERC20 units
 */

// Format wei to ETH with custom decimal places
export const formatEth = (wei: bigint, decimals: number = 4): string => {
  const ethValue = formatEther(wei)

  if (ethValue === '0') return '0'

  const numValue = Number(ethValue)

  if (numValue < 0.0001) {
    return `${numValue.toFixed(6)} ETH`
  }

  if (numValue < 1) {
    return `${numValue.toFixed(decimals)} ETH`
  }

  if (numValue >= 1000000) {
    return `${(numValue / 1000000).toFixed(decimals)}M ETH`
  }

  if (numValue >= 1000) {
    return `${(numValue / 1000).toFixed(decimals)}K ETH`
  }

  return `${numValue.toFixed(decimals)} ETH`
}

// Format any ERC20 token amount (requires decimals parameter)
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

// Convert ETH string to wei BigInt
export const parseEth = (eth: string): bigint => {
  return parseEther(eth)
}

// Convert token amount to smallest unit
export const parseToken = (amount: string, decimals: number): bigint => {
  return parseUnits(amount, decimals)
}

// Format currency value with proper separators
export const formatCurrency = (
  value: number,
  currency: string = 'USD'
): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Format number with compact notation (K, M, B)
export const formatCompactNumber = (value: number): string => {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`
  }
  return value.toFixed(2)
}

// Convert ETH amount to USD value (requires ETH price)
export const formatEthInCurrency = (
  wei: bigint,
  ethPrice: number,
  currency: string = 'USD'
): string => {
  // Check if price is valid
  if (!ethPrice || isNaN(ethPrice) || ethPrice <= 0) {
    return 'Price unavailable'
  }

  const ethValue = Number(formatEther(wei))
  const currencyValue = ethValue * ethPrice

  if (currencyValue === 0) return formatCurrency(0, currency)

  if (currencyValue < 0.01) {
    return `< ${formatCurrency(0.01, currency)}`
  }

  return formatCurrency(currencyValue, currency)
}

// Convert any token amount to currency value
export const formatTokenInCurrency = (
  amount: bigint,
  decimals: number,
  tokenPrice: number,
  currency: string = 'USD'
): string => {
  // Check if price is valid
  if (!tokenPrice || isNaN(tokenPrice) || tokenPrice <= 0) {
    return 'Price unavailable'
  }

  const tokenValue = Number(formatUnits(amount, decimals))
  const currencyValue = tokenValue * tokenPrice

  if (currencyValue === 0) return formatCurrency(0, currency)

  if (currencyValue < 0.01) {
    return `< ${formatCurrency(0.01, currency)}`
  }

  return formatCurrency(currencyValue, currency)
}

// Format price change with appropriate colors and signs
export const formatPriceChange = (
  change: number,
  showPercentage: boolean = true
): { text: string; color: string; icon: string } => {
  const isPositive = change > 0
  const isNeutral = change === 0

  let text: string
  let color: string
  let icon: string

  if (showPercentage) {
    text = `${isPositive ? '+' : ''}${change.toFixed(2)}%`
    color = isPositive
      ? 'text-green-500'
      : isNeutral
        ? 'text-gray-500'
        : 'text-red-500'
    icon = isPositive ? '↗' : isNeutral ? '→' : '↘'
  } else {
    text = `${isPositive ? '+' : ''}${formatCurrency(change)}`
    color = isPositive
      ? 'text-green-500'
      : isNeutral
        ? 'text-gray-500'
        : 'text-red-500'
    icon = isPositive ? '↗' : isNeutral ? '→' : '↘'
  }

  return { text, color, icon }
}
