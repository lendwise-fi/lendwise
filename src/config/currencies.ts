import currencyList from 'currency-list'

// Define which fiat currencies to support with their CoinGecko IDs
const SUPPORTED_FIAT_CODES = [
  { code: 'USD', coinGeckoId: 'usd' },
  { code: 'EUR', coinGeckoId: 'eur' },
  { code: 'GBP', coinGeckoId: 'gbp' },
  { code: 'JPY', coinGeckoId: 'jpy' },
  { code: 'CHF', coinGeckoId: 'chf' },
  { code: 'CAD', coinGeckoId: 'cad' },
  { code: 'AUD', coinGeckoId: 'aud' },
  { code: 'BRL', coinGeckoId: 'brl' },
  { code: 'HKD', coinGeckoId: 'hkd' },
  { code: 'INR', coinGeckoId: 'inr' },
  { code: 'KRW', coinGeckoId: 'krw' },
  { code: 'MXN', coinGeckoId: 'mxn' },
  { code: 'NOK', coinGeckoId: 'nok' },
  { code: 'NZD', coinGeckoId: 'nzd' },
  { code: 'RUB', coinGeckoId: 'rub' },
  { code: 'SEK', coinGeckoId: 'sek' },
  { code: 'SGD', coinGeckoId: 'sgd' },
  { code: 'TRY', coinGeckoId: 'try' },
]

// Define crypto currencies
const CRYPTO_CURRENCIES: Currency[] = [
  {
    code: 'BTC',
    name: 'Bitcoin',
    symbol: '₿',
    type: 'crypto',
    coinGeckoId: 'bitcoin',
    iconPath:
      'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/btc.svg',
  },
  {
    code: 'ETH',
    name: 'Ethereum',
    symbol: 'ETH',
    type: 'crypto',
    coinGeckoId: 'ethereum',
    iconPath:
      'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eth.svg',
  },
]

export interface Currency {
  code: string
  name: string
  symbol: string
  type: 'fiat' | 'crypto'
  coinGeckoId: string // CoinGecko API identifier for conversion rates
  iconPath?: string
  emoji?: string // Optional emoji for ultra-lightweight display
}

// Filter to only supported fiat currencies
const supportedFiatCurrencies: Currency[] = SUPPORTED_FIAT_CODES.map((item) => {
  const currency = currencyList.get(item.code)
  return {
    code: item.code,
    name: currency?.name || item.code,
    symbol: currency?.symbol || item.code,
    type: 'fiat' as const,
    coinGeckoId: item.coinGeckoId,
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
