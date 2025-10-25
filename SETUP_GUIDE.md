# YieldOptimizer Setup Guide

## Prerequisites

- Node.js >= 22.0.0
- pnpm package manager
- WalletConnect Project ID

## Installation

```bash
# Install dependencies
pnpm install

# Clear Next.js cache (recommended after setup)
rm -rf .next
```

## Environment Setup

Create a `.env.local` file in the root directory:

```env
# Required: WalletConnect Project ID
# Get yours at: https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Optional: Enable testnets (default: false)
NEXT_PUBLIC_ENABLE_TESTNETS=false
```

## Running the Application

```bash
# Development
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint
pnpm lint

# Format code
pnpm format
```

The app will be available at `http://localhost:3000`

## Supported Networks

### Aave V3
- ✅ Ethereum Mainnet (Chain ID: 1)
- ✅ Polygon (Chain ID: 137)
- ✅ Arbitrum (Chain ID: 42161)
- ✅ Optimism (Chain ID: 10)
- ✅ Base (Chain ID: 8453)

### Compound V3
- ✅ Ethereum Mainnet (Chain ID: 1)
- ✅ Polygon (Chain ID: 137)
- ✅ Base (Chain ID: 8453)

### Morpho Blue
- ✅ Ethereum Mainnet (Chain ID: 1)
- ✅ Base (Chain ID: 8453)

## How It Works

1. **Connect Wallet**: Use RainbowKit to connect your wallet
2. **Auto-Detection**: The app automatically detects your network
3. **Position Fetching**: Fetches your positions from all supported protocols on that network
4. **Aggregation**: Combines positions into a unified dashboard
5. **Optimization**: Analyzes positions for yield optimization opportunities

## Key Features

### 📊 Dashboard
- Total portfolio value across all protocols
- Average yield (APY) on lending positions
- Health factor monitoring for borrowing positions  
- Net position (lending - borrowing)
- Protocol-wise breakdown

### 🔍 Position Tracking
- Real-time on-chain data
- Supply and borrow positions
- Collateral status
- Individual market details

### 💡 Optimization
- Identifies higher yield opportunities
- Compares same assets across protocols
- Health factor warnings
- Risk management alerts

## Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

```
src/
├── types/          # TypeScript definitions
├── config/         # Protocol configurations & ABIs
├── services/       # Protocol integration services
├── hooks/          # React hooks for data fetching
├── components/     # UI components
└── app/            # Next.js pages
```

## Usage Examples

### Getting User Positions

```tsx
import { usePositions } from '@/hooks/usePositions'

function MyComponent() {
  const { positions, loading, error, refetch } = usePositions()
  
  // positions: Array of all positions across protocols
  // loading: Boolean indicating fetch status
  // error: Error object if fetch failed
  // refetch: Function to manually refresh data
}
```

### Getting Portfolio Summary

```tsx
import { usePositionSummary } from '@/hooks/usePositions'

function Dashboard() {
  const { summary, loading } = usePositionSummary()
  
  // summary.totalSupplyUSD
  // summary.totalBorrowUSD
  // summary.netAPY
  // summary.healthFactor
  // summary.positions
  // summary.protocolBreakdown
}
```

### Protocol-Specific Positions

```tsx
import { useProtocolPositions } from '@/hooks/usePositions'

function AavePositions() {
  const { positions } = useProtocolPositions('aave')
  // Returns only Aave positions
}
```

### Finding Optimization Opportunities

```tsx
import { useOpportunities } from '@/hooks/usePositions'

function Opportunities() {
  const { opportunities } = useOpportunities()
  
  opportunities.forEach(opp => {
    console.log(opp.type)        // 'higher-yield' | 'health-warning'
    console.log(opp.title)       // Human-readable title
    console.log(opp.description) // Detailed description
    console.log(opp.currentAPY)  // Current APY if applicable
    console.log(opp.betterAPY)   // Better APY available
  })
}
```

## Troubleshooting

### Wallet Not Connecting
- Clear browser cache
- Try a different wallet
- Check that you're on a supported network
- Ensure WalletConnect Project ID is set

### No Positions Showing
- Confirm wallet has positions on the current network
- Check browser console for errors
- Verify network is supported (see list above)
- Try switching networks and back

### Build Errors
```bash
# Clear cache and reinstall
pnpm clean
pnpm install

# Or full reset
rm -rf node_modules pnpm-lock.yaml .next
pnpm install
```

### RPC Rate Limiting
The app makes multiple RPC calls to fetch positions. If you experience rate limiting:
- Use a custom RPC provider (configure in `src/lib/wagmi.ts`)
- Consider implementing request caching
- Add delays between protocol calls

## Development Tips

### Adding Support for New Tokens
Token metadata is fetched automatically from contracts. No manual configuration needed.

### Adding New Protocols
See [ARCHITECTURE.md#adding-a-new-protocol](./ARCHITECTURE.md#adding-a-new-protocol) for step-by-step guide.

### Testing
```bash
# No tests yet - contributions welcome!
```

### Debugging
- Open browser DevTools Console
- Check for RPC errors or contract call failures
- Verify contract addresses in `src/config/protocols.ts`
- Test individual protocol services in isolation

## Performance Optimization

### Current Performance
- Initial load: Fetches all protocols in parallel
- Typical fetch time: 2-5 seconds depending on positions
- Auto-refreshes on wallet/chain change

### Recommended Improvements
- [ ] Implement React Query for caching
- [ ] Add service worker for offline support
- [ ] Lazy load protocol data on demand
- [ ] Batch multiple contract reads
- [ ] Use multicall contracts where available

## Security Considerations

- **Read-only**: App only reads blockchain data, no write operations
- **No private keys**: Wallet connection handled by RainbowKit
- **No backend**: Fully client-side application
- **Open source**: Code is auditable

## Contributing

Contributions welcome! Areas for improvement:
- Add more protocols (Euler, Radiant, Spark, etc.)
- Implement transaction execution
- Add historical data tracking
- Build notification system
- Create mobile-responsive design improvements

## Support

For issues or questions:
1. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
2. Review this setup guide
3. Open an issue on GitHub
4. Check existing issues for solutions

## License

MIT License - see LICENSE file for details
