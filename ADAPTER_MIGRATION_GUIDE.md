# Adapter Architecture Migration Guide

## Summary of Changes

The adapter architecture has been refactored to support:

1. **Multiple protocol versions** (e.g., AAVE v2, v3, Compound v2, v3)
2. **Data source abstraction** (GraphQL API vs Subgraph)
3. **Unified interface** for all protocols
4. **Easy extensibility** for new protocols and versions

## What Changed

### Before (Old Architecture)

```typescript
// Flat structure
aave/
  gql/
    index.ts
    queries.ts
  index.ts

// Usage
import { AaveAdapter } from '@/lib/adapters/aave'
const positions = await AaveAdapter.getUserLendPositions(['0x...'])
```

### After (New Architecture)

```typescript
// Versioned structure
aave/
  config.ts          # Configuration
  index.ts           # Main adapter
  v3/
    index.ts
    graphql/
      index.ts
      queries.ts
      generated/

// Usage - Same interface!
import { AaveAdapter } from '@/lib/adapters/aave'

// Use default version (v3)
const positions = await AaveAdapter.getUserLendPositions(['0x...'])

// Use specific version
const v3Positions = await AaveAdapter.getUserLendPositions(['0x...'], 'v3')
```

## Key Benefits

### 1. Version Support

You can now specify which protocol version to use:

```typescript
// AAVE v3 (default)
const v3Positions = await AaveAdapter.getUserLendPositions(['0x...'], 'v3')

// AAVE v2 (when implemented)
const v2Positions = await AaveAdapter.getUserLendPositions(['0x...'], 'v2')
```

### 2. Data Source Transparency

The architecture abstracts whether data comes from GraphQL API or Subgraph:

```typescript
const v3 = AaveAdapter.getVersion('v3')
console.log(v3.dataAdapter.dataSourceType) // 'graphql'

// Compound uses subgraph
const compound = CompoundAdapter.getVersion('v3')
console.log(compound.dataAdapter.dataSourceType) // 'subgraph'
```

### 3. Backward Compatibility

**All existing code continues to work!** The new architecture maintains backward compatibility:

```typescript
// Old code still works
import { AaveAdapter } from '@/lib/adapters/aave'
const positions = await AaveAdapter.getUserLendPositions(['0x...'])

// Legacy gqlAdapter export also maintained
import { gqlAdapter } from '@/lib/adapters/aave'
const positions = await gqlAdapter.getUserLendPositions(['0x...'])
```

## Migration Path

### For Application Code

**No changes required!** Your existing code will continue to work.

If you want to use version-specific features:

```typescript
// Before
const positions = await AaveAdapter.getUserLendPositions(['0x...'])

// After (optional - specify version)
const positions = await AaveAdapter.getUserLendPositions(['0x...'], 'v3')
```

### For Adding New Protocols

Follow the guide in `/src/lib/adapters/README.md`

Quick steps:
1. Create protocol directory structure
2. Implement data adapter
3. Create version adapter
4. Create protocol adapter
5. Update codegen config
6. Register in protocol registry

### For Adding New Versions

Example: Adding AAVE v2

```bash
# 1. Create directory
mkdir -p src/lib/adapters/aave/v2/graphql

# 2. Implement adapter (copy from v3 and modify)
# 3. Update main adapter
```

```typescript
// src/lib/adapters/aave/index.ts
export const AaveAdapter = createProtocolAdapter(
  PROTOCOL_ID,
  {
    v2: aaveV2Adapter,  // Add new version
    v3: aaveV3Adapter,
  },
  'v3' // Keep v3 as default
)
```

## Current Protocol Status

### ✅ AAVE
- **Status**: Migrated to new architecture
- **Versions**: v3 (default)
- **Data Source**: GraphQL API
- **Location**: `src/lib/adapters/aave/v3/graphql/`

### ⏳ Morpho
- **Status**: Legacy adapter (not yet migrated)
- **Data Source**: GraphQL API
- **Next Steps**: Migrate to versioned structure

### ⏳ Compound
- **Status**: Legacy adapter (not yet migrated)
- **Data Source**: Subgraph only
- **Next Steps**: Migrate to versioned structure

## API Reference

### ProtocolAdapter

```typescript
interface ProtocolAdapter {
  protocol: string
  versions: Record<string, VersionAdapter>
  defaultVersion: string
  
  getVersion(version?: string): VersionAdapter
  getUserLendPositions(addresses: Address[], version?: string): Promise<LendPosition[]>
  getUserBorrowPositions(addresses: Address[], version?: string): Promise<BorrowPosition[]>
}
```

### VersionAdapter

```typescript
interface VersionAdapter {
  version: string
  dataAdapter: BaseDataAdapter
  stats?: StatsAdapter
}
```

### BaseDataAdapter

```typescript
interface BaseDataAdapter {
  dataSourceType: 'graphql' | 'subgraph'
  getUserLendPositions(addresses: Address[]): Promise<LendPosition[]>
  getUserBorrowPositions(addresses: Address[]): Promise<BorrowPosition[]>
}
```

## Helper Functions

### createProtocolAdapter

Creates a protocol adapter with version management:

```typescript
import { createProtocolAdapter } from '@/lib/adapters/utils'

const MyProtocolAdapter = createProtocolAdapter(
  'myprotocol',
  {
    v1: myProtocolV1Adapter,
    v2: myProtocolV2Adapter,
  },
  'v2' // default version
)
```

### createVersionAdapter

Creates a version adapter:

```typescript
import { createVersionAdapter } from '@/lib/adapters/utils'

const myProtocolV1Adapter = createVersionAdapter(
  'v1',
  myProtocolV1GraphqlAdapter,
  myProtocolV1StatsAdapter // optional
)
```

### isVersionedAdapter

Check if an adapter supports versions:

```typescript
import { isVersionedAdapter } from '@/config/protocols'

if (isVersionedAdapter(adapter)) {
  const version = adapter.getVersion('v3')
  // ...
}
```

## Testing

When testing with the new architecture:

```typescript
import { AaveAdapter } from '@/lib/adapters/aave'

describe('AAVE Adapter', () => {
  it('should fetch v3 positions', async () => {
    const positions = await AaveAdapter.getUserLendPositions(['0x...'], 'v3')
    expect(positions).toBeDefined()
  })
  
  it('should use default version', async () => {
    const positions = await AaveAdapter.getUserLendPositions(['0x...'])
    // Uses v3 by default
    expect(positions).toBeDefined()
  })
  
  it('should throw for unsupported version', async () => {
    await expect(
      AaveAdapter.getUserLendPositions(['0x...'], 'v1')
    ).rejects.toThrow()
  })
})
```

## Troubleshooting

### "Version 'vX' not supported"

Make sure the version exists in the protocol adapter:

```typescript
// Check available versions
console.log(Object.keys(AaveAdapter.versions)) // ['v3']
```

### "Cannot find module './generated/graphql'"

Run codegen to generate types:

```bash
pnpm run codegen
```

### Type errors after migration

Make sure you're importing from the correct location:

```typescript
// ✅ Correct
import { AaveAdapter } from '@/lib/adapters/aave'

// ❌ Incorrect (old path)
import { gqlAdapter } from '@/lib/adapters/aave/gql'
```

## Resources

- **Full Documentation**: `/src/lib/adapters/README.md`
- **Type Definitions**: `/src/lib/adapters/types.ts`
- **Helper Functions**: `/src/lib/adapters/utils.ts`
- **Protocol Registry**: `/src/config/protocols.ts`

## Questions?

For questions or issues with the new architecture, please refer to:
1. The comprehensive README at `/src/lib/adapters/README.md`
2. Type definitions in `/src/lib/adapters/types.ts`
3. Example implementation in `/src/lib/adapters/aave/`
