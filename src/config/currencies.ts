import currencyList from 'currency-list'

// Define which fiat currencies to support
const SUPPORTED_FIAT_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD']

// Define crypto currencies
const CRYPTO_CURRENCIES: Currency[] = [
  {
    code: 'BTC',
    name: 'Bitcoin',
    symbol: '₿',
    type: 'crypto',
    iconPath:
      'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/btc.svg',
  },
  {
    code: 'ETH',
    name: 'Ethereum',
    symbol: 'ETH',
    type: 'crypto',
    iconPath:
      'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eth.svg',
  },
]

export interface Currency {
  code: string
  name: string
  symbol: string
  type: 'fiat' | 'crypto'
  iconPath?: string
  emoji?: string // Optional emoji for ultra-lightweight display
}

// Filter to only supported fiat currencies
const supportedFiatCurrencies: Currency[] = SUPPORTED_FIAT_CODES.map((code) => {
  const currency = currencyList.get(code)
  return {
    code: code,
    name: currency?.name || code,
    symbol: currency?.symbol || code,
    type: 'fiat' as const,
  }
})

// Combine fiat and crypto currencies
export const SUPPORTED_CURRENCIES: Currency[] = [
  ...supportedFiatCurrencies,
  ...CRYPTO_CURRENCIES,
]

// Helper to get currency by code
export const getCurrencyByCode = (code: string): Currency | undefined => {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)
}

// Helper to format currency display
export const formatCurrencyDisplay = (currency: Currency): string => {
  return `${currency.code} (${currency.symbol})`
}
