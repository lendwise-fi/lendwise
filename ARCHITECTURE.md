# Lendwise Architecture

## Overview

Lendwise is a professional DeFi yield optimization platform that aggregates positions from multiple supplying protocols (Aave, Compound, Morpho) and provides actionable insights for maximizing returns.

## Project Structure

```
src/
├── types/
│   └── defi.ts                      # Core TypeScript types and interfaces
├── config/
│   ├── protocols.ts                 # Protocol configurations (addresses, chains)
│   └── abis/
│       ├── aave.ts                  # Aave V3 contract ABIs
│       ├── compound.ts              # Compound V3 (Comet) ABIs
│       └── morpho.ts                # Morpho Blue ABIs
├── services/
│   ├── protocols/
│   │   ├── aave.service.ts         # Aave protocol integration
│   │   ├── compound.service.ts     # Compound protocol integration
│   │   └── morpho.service.ts       # Morpho protocol integration
│   └── position-aggregator.service.ts # Aggregates all protocol data
├── hooks/
│   └── usePositions.ts             # React hooks for fetching positions
├── components/
│   ├── dashboard/                  # Dashboard-specific components
│   └── ui/                        # Reusable UI components
└── app/
    ├── dashboard/                  # Dashboard page
    ├── supplying/                    # Supplying page
    └── borrowing/                  # Borrowing page
```

## Architecture Layers

### 1. Type Layer (`src/types/`)

Defines all TypeScript interfaces and types used throughout the application:

- `Position`: Individual supplying/borrowing position
- `Market`: Protocol market data
- `UserPositionSummary`: Aggregated user portfolio data
- `ProtocolConfig`: Protocol configuration structure

### 2. Configuration Layer (`src/config/`)

**Protocol Configurations:**

- Chain-specific contract addresses
- Subgraph URLs
- Protocol metadata

**Contract ABIs:**

- Minimal, focused ABIs containing only the functions we need
- Typed with TypeScript for type safety

### 3. Service Layer (`src/services/`)

**Protocol Services:**
Each protocol has its own service class that handles:

- Contract interactions via viem
- Data transformation
- Error handling
- Position fetching

**Position Aggregator:**

- Combines data from all protocols
- Provides unified interface
- Calculates portfolio metrics
- Finds optimization opportunities

### 4. Hook Layer (`src/hooks/`)

React hooks that:

- Integrate with Wagmi for wallet connection
- Manage loading/error states
- Auto-refresh on wallet/chain changes
- Provide easy-to-use data access in components

### 5. Component Layer (`src/components/`)

- Presentational components
- Business logic delegated to hooks
- Reusable across pages

## Data Flow

```
User Wallet (RainbowKit/Wagmi)
    ↓
React Hooks (usePositions, usePositionSummary)
    ↓
Position Aggregator Service
    ↓
Protocol Services (Aave, Compound, Morpho)
    ↓
Smart Contracts (via viem PublicClient)
```

## Supported Protocols

### Aave V3

- **Chains:** Ethereum, Polygon, Arbitrum
- **Features:** Supply, borrow, health factor tracking
- **Data Source:** Direct on-chain calls

### Compound V3 (Comet)

- **Chains:** Ethereum, Polygon, Base
- **Features:** Supply, borrow, collateral tracking
- **Data Source:** Direct on-chain calls

### Morpho Blue

- **Chains:** Ethereum, Base
- **Features:** Isolated supplying markets
- **Data Source:** Subgraph + on-chain fallback

## Key Features

### 1. Multi-Protocol Position Aggregation

Fetches and combines positions from all supported protocols into a unified view.

### 2. Real-Time Health Factor Monitoring

Tracks liquidation risk across all borrowing positions.

### 3. Yield Optimization Recommendations

Analyzes positions to find:

- Higher yield opportunities on same assets
- Lower borrow rates
- Health factor warnings

### 4. Protocol-Agnostic Design

Easy to add new protocols by:

1. Creating a new service class
2. Adding protocol config
3. Updating the aggregator

## Usage Examples

### Fetching All Positions

```tsx
import { usePositions } from '@/hooks/usePositions'

function MyComponent() {
  const { positions, loading, error } = usePositions()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      {positions.map((position) => (
        <PositionCard key={position.id} position={position} />
      ))}
    </div>
  )
}
```

### Getting Portfolio Summary

```tsx
import { usePositionSummary } from '@/hooks/usePositions'

function Dashboard() {
  const { summary, loading } = usePositionSummary()

  return (
    <div>
      <h2>Total Value: ${summary?.totalSupplyUSD}</h2>
      <h3>Health Factor: {summary?.healthFactor}</h3>
    </div>
  )
}
```

### Finding Opportunities

```tsx
import { useOpportunities } from '@/hooks/usePositions'

function Opportunities() {
  const { opportunities, loading } = useOpportunities()

  return (
    <div>
      {opportunities.map((opp, i) => (
        <Alert key={i}>
          <h4>{opp.title}</h4>
          <p>{opp.description}</p>
        </Alert>
      ))}
    </div>
  )
}
```

## Environment Variables

Required environment variables:

```env
# WalletConnect Project ID (get from https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Optional: Enable testnets
NEXT_PUBLIC_ENABLE_TESTNETS=false
```

## Adding a New Protocol

To add support for a new supplying protocol:

1. **Add Type Definitions** (if needed)

   ```typescript
   // src/types/defi.ts
   export type ProtocolName = 'aave' | 'compound' | 'morpho' | 'newprotocol'
   ```

2. **Create Protocol Config**

   ```typescript
   // src/config/protocols.ts
   export const NEW_PROTOCOL_CONFIG: Record<number, ProtocolConfig> = {
     [mainnet.id]: {
       name: 'newprotocol',
       displayName: 'New Protocol',
       // ... config
     },
   }
   ```

3. **Add Contract ABIs**

   ```typescript
   // src/config/abis/newprotocol.ts
   export const NEW_PROTOCOL_ABI = [
     /* ... */
   ] as const
   ```

4. **Create Service Class**

   ```typescript
   // src/services/protocols/newprotocol.service.ts
   export class NewProtocolService {
     async getUserPositions(userAddress: Address): Promise<Position[]> {
       // Implementation
     }
   }
   ```

5. **Update Aggregator**
   ```typescript
   // src/services/position-aggregator.service.ts
   // Add initialization and fetching logic
   ```

## Best Practices

1. **Error Handling**: All service methods should handle errors gracefully
2. **Type Safety**: Use TypeScript strictly, avoid `any`
3. **Performance**: Batch RPC calls where possible
4. **Caching**: Consider implementing result caching for repeated calls
5. **Testing**: Add unit tests for service classes (TODO)

## Future Enhancements

- [ ] Add transaction execution (supply, withdraw, borrow, repay)
- [ ] Implement result caching with React Query
- [ ] Add more protocols (Euler, Radiant, etc.)
- [ ] Historical position tracking
- [ ] Gas optimization analysis
- [ ] Automated yield optimization strategies
- [ ] Price oracle integration for accurate USD values
- [ ] Notification system for health factor alerts
