# Currency Icons Setup Guide

## Installation

Run the following command to install the required package:

```bash
pnpm add react-currency-flags
```

**Note:** We use CDN for cryptocurrency icons to avoid bloating the bundle size. No need to install `cryptocurrency-icons` package!

## Usage

The currency selector in Settings will automatically display:

- **Fiat currencies**: Country flags (via `react-currency-flags`)
- **Crypto currencies**: Cryptocurrency icons (via `cryptocurrency-icons`)

## Adding More Cryptocurrencies

Edit `/src/config/currencies.ts`:

```typescript
const CRYPTO_CURRENCIES: Currency[] = [
  {
    code: 'BTC',
    name: 'Bitcoin',
    symbol: '₿',
    type: 'crypto',
    iconPath: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg',
  },
  {
    code: 'ETH',
    name: 'Ethereum',
    symbol: 'ETH',
    type: 'crypto',
    iconPath: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg',
  },
  // Add more crypto here
  {
    code: 'USDT',
    name: 'Tether',
    symbol: '₮',
    type: 'crypto',
    iconPath:
      'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/usdt.svg',
  },
]
```

**CDN Sources for Crypto Icons:**

- GitHub (cryptocurrency-icons): `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/[symbol].svg`
  - Example: `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/btc.svg`
  - CORS-friendly and free to use
- Alternative: Use emoji field for zero external dependencies

**Icon Styling:**

- All currency icons (both fiat and crypto) are displayed as **rounded circles** (`rounded-full`)
- Fiat flags are wrapped in a rounded container
- Crypto icons have rounded styling applied directly
