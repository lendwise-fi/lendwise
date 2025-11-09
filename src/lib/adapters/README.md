# Protocol Adapters Architecture

This document describes the architecture for protocol adapters in the Yield Optimizer platform.

## Overview

The adapter architecture is designed to:
1. **Support multiple protocol versions** (e.g., AAVE v2, v3)
2. **Abstract data sources** (GraphQL API vs Subgraph)
3. **Provide a unified interface** for fetching user positions
4. **Enable easy extension** for new protocols and versions

## Architecture

### Directory Structure

```
src/lib/adapters/
├── types.ts                    # Core adapter interfaces
├── utils.ts                    # Helper functions for creating adapters
├── [protocol]/                 # e.g., aave, morpho, compound
│   ├── index.ts               # Protocol-level exports and main adapter
│   ├── config.ts              # Protocol configuration (chains, contracts, markets)
│   │
│   ├── v2/                    # Version-specific adapter (if applicable)
│   │   ├── index.ts           # Version adapter assembler
│   │   ├── graphql/           # GraphQL API adapter (if available)
│   │   │   ├── index.ts       # Adapter implementation
│   │   │   ├── queries.ts     # GraphQL queries
│   │   │   └── generated/     # Auto-generated types (gitignored)
│   │   └── subgraph/          # Subgraph adapter (if available)
│   │       ├── index.ts       # Adapter implementation
│   │       ├── queries.ts     # GraphQL queries for subgraph
│   │       └── generated/     # Auto-generated types (gitignored)
│   │
│   └── v3/                    # Another version
│       ├── index.ts
│       ├── graphql/
│       └── subgraph/
```

### Key Concepts

#### 1. Data Source Abstraction

Each adapter can use either:
- **GraphQL API**: Direct API provided by the protocol (e.g., AAVE V3 API, Morpho API)
- **Subgraph**: The Graph protocol subgraph (e.g., Compound community subgraphs)

The `BaseDataAdapter` interface abstracts these differences:

```typescript
interface BaseDataAdapter {
  readonly dataSourceType: 'graphql' | 'subgraph'
  getUserLendPositions(addresses: Address[]): Promise<LendPosition[]>
  getUserBorrowPositions(addresses: Address[]): Promise<BorrowPosition[]>
}
```

#### 2. Version Management

Each protocol can have multiple versions. A `VersionAdapter` wraps a data adapter:

```typescript
interface VersionAdapter {
  readonly version: string
  readonly dataAdapter: BaseDataAdapter
  readonly stats?: StatsAdapter
}
```

#### 3. Protocol Adapter

The main `ProtocolAdapter` manages all versions for a protocol:

```typescript
interface ProtocolAdapter {
  readonly protocol: string
  readonly versions: Record<string, VersionAdapter>
  readonly defaultVersion: string
  
  getVersion(version?: string): VersionAdapter
  getUserLendPositions(addresses: Address[], version?: string): Promise<LendPosition[]>
  getUserBorrowPositions(addresses: Address[], version?: string): Promise<BorrowPosition[]>
}
```

## Usage Examples

### Basic Usage (Default Version)

```typescript
import { AaveAdapter } from '@/lib/adapters/aave'

// Uses default version (v3)
const positions = await AaveAdapter.getUserLendPositions(['0x...'])
```

### Specific Version

```typescript
import { AaveAdapter } from '@/lib/adapters/aave'

// Explicitly use v3
const v3Positions = await AaveAdapter.getUserLendPositions(['0x...'], 'v3')

// Use v2 (when implemented)
const v2Positions = await AaveAdapter.getUserLendPositions(['0x...'], 'v2')
```

### Access Version Details

```typescript
import { AaveAdapter } from '@/lib/adapters/aave'

// Get version adapter
const v3 = AaveAdapter.getVersion('v3')
console.log(v3.dataAdapter.dataSourceType) // 'graphql'

// Direct access to data adapter
const positions = await v3.dataAdapter.getUserLendPositions(['0x...'])
```

## Adding a New Protocol

### 1. Create Protocol Directory Structure

```bash
mkdir -p src/lib/adapters/[protocol]/v1/graphql
```

### 2. Create Configuration File

Create `src/lib/adapters/[protocol]/config.ts`:

```typescript
export const PROTOCOL_ID = 'myprotocol' as const

export const MY_PROTOCOL_V1_CONFIG: Record<number, ProtocolConfig> = {
  [mainnet.id]: {
    name: PROTOCOL_ID,
    displayName: 'My Protocol V1',
    chainId: mainnet.id,
    contracts: { /* ... */ },
    markets: [ /* ... */ ],
    blockExplorer: 'https://etherscan.io',
  },
}
```

### 3. Create GraphQL Queries

Create `src/lib/adapters/[protocol]/v1/graphql/queries.ts`:

```typescript
import { gql } from 'urql'

export const USER_LEND_POSITIONS = gql`
  query UserLendPositions($address: String!) {
    // Your query here
  }
`
```

### 4. Implement Data Adapter

Create `src/lib/adapters/[protocol]/v1/graphql/index.ts`:

```typescript
import type { BaseDataAdapter } from '@/lib/adapters/types'

export const myProtocolV1GraphqlAdapter: BaseDataAdapter = {
  dataSourceType: 'graphql',
  async getUserLendPositions(addresses) {
    // Implementation
  },
  async getUserBorrowPositions(addresses) {
    // Implementation
  },
}
```

### 5. Create Version Adapter

Create `src/lib/adapters/[protocol]/v1/index.ts`:

```typescript
import { createVersionAdapter } from '../../utils'
import { myProtocolV1GraphqlAdapter } from './graphql'

export const myProtocolV1Adapter = createVersionAdapter(
  'v1',
  myProtocolV1GraphqlAdapter
)
```

### 6. Create Protocol Adapter

Create `src/lib/adapters/[protocol]/index.ts`:

```typescript
import { createProtocolAdapter } from '../utils'
import { PROTOCOL_ID } from './config'
import { myProtocolV1Adapter } from './v1'

export const MyProtocolAdapter = createProtocolAdapter(
  PROTOCOL_ID,
  {
    v1: myProtocolV1Adapter,
  },
  'v1' // default version
)

export { PROTOCOL_ID }
```

### 7. Update CodeGen Configuration

Add to `codegen.ts`:

```typescript
'src/lib/adapters/[protocol]/v1/graphql/generated/': {
  schema: 'https://api.myprotocol.com/graphql',
  documents: 'src/lib/adapters/[protocol]/v1/graphql/queries.ts',
  preset: 'client',
  presetConfig: {
    fragmentMasking: false,
  },
},
```

### 8. Generate Types

```bash
pnpm run codegen
```

### 9. Register in Protocol Registry

Update `src/config/protocols.ts`:

```typescript
import { MY_PROTOCOL_CONFIG, PROTOCOL_ID as MY_PROTOCOL_ID } from '@/lib/adapters/myprotocol'

export const PROTOCOL_REGISTRY = {
  // ... existing protocols
  [MY_PROTOCOL_ID]: {
    displayName: 'My Protocol',
    config: MY_PROTOCOL_CONFIG,
    adapter: () => import('@/lib/adapters/myprotocol').then((m) => m.MyProtocolAdapter),
  },
}
```

## Adding a New Version to Existing Protocol

### 1. Create Version Directory

```bash
mkdir -p src/lib/adapters/[protocol]/v2/graphql
```

### 2. Implement Version Adapter

Follow steps 3-5 from "Adding a New Protocol" above.

### 3. Update Protocol Adapter

Update `src/lib/adapters/[protocol]/index.ts`:

```typescript
export const MyProtocolAdapter = createProtocolAdapter(
  PROTOCOL_ID,
  {
    v1: myProtocolV1Adapter,
    v2: myProtocolV2Adapter, // Add new version
  },
  'v2' // Update default version if needed
)
```

## Protocol-Specific Notes

### AAVE
- **Current Versions**: v3 (default)
- **Data Source**: GraphQL API (`https://api.v3.aave.com/graphql`)
- **Features**: Multi-chain support, health factor tracking
- **Future**: v2 support via subgraph

### Morpho
- **Current Versions**: v1 (default)
- **Data Source**: GraphQL API (`https://api.morpho.org/graphql`)
- **Features**: Vault-based lending

### Compound
- **Current Versions**: v3 (default)
- **Data Source**: Community Subgraph (no official GraphQL API)
- **Note**: Relies entirely on The Graph subgraphs

## Type Generation

All GraphQL types are auto-generated using GraphQL Code Generator:

```bash
# Generate types for all adapters
pnpm run codegen

# Types are generated in [adapter]/[version]/[source]/generated/
# These directories are gitignored
```

## Testing

When testing adapters:

1. **Unit Tests**: Test individual adapter methods
2. **Integration Tests**: Test against real APIs (with rate limiting)
3. **Mock Data**: Use generated types to create mock responses

## Best Practices

1. **Always use generated types** from GraphQL Code Generator
2. **Handle errors gracefully** - APIs can timeout or fail
3. **Implement rate limiting** for API calls
4. **Cache responses** when appropriate
5. **Log errors** but return empty arrays instead of throwing
6. **Document protocol-specific quirks** in code comments
7. **Keep backward compatibility** when updating adapters

## Migration Guide

### From Old Architecture to New

The old architecture used a flat structure:
```
aave/
  gql/
  subgraph/
```

The new architecture uses versioned structure:
```
aave/
  config.ts
  v3/
    graphql/
    subgraph/
```

**Backward Compatibility**: The old `gqlAdapter` export is maintained as a deprecated wrapper around the new `AaveAdapter`.

## Future Enhancements

1. **Cross-chain aggregation**: Aggregate positions across multiple chains
2. **Historical data**: Add time-series data support via stats adapters
3. **Real-time updates**: WebSocket support for live position updates
4. **Caching layer**: Redis/memory cache for frequently accessed data
5. **Rate limiting**: Built-in rate limiting for API calls
