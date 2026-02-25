# Protocol Registry System

## Overview

The application now uses a **config-driven approach** for managing lending protocols. All protocol handling is centralized in a single registry, eliminating the need to manually update multiple files when adding or removing protocols.

## Architecture

### Key Files

- **`src/config/protocols.ts`**: Contains `SUPPORTED_PROTOCOLS` registry - the single source of truth
- **`src/app/actions/user-positions.actions.ts`**: Dynamically loads adapters from the registry
- **`src/types/lending.ts`**: Defines the `Protocol` union type

### How It Works

1. **Protocol Registry** (`SUPPORTED_PROTOCOLS`): An array of protocol entries, each containing:
   - `name`: The protocol identifier (must match the `Protocol` type)
   - `adapter`: A dynamic import function that loads the protocol adapter

2. **Dynamic Loading**: The `loadUserPositions` action:
   - Iterates through `SUPPORTED_PROTOCOLS`
   - Dynamically imports each adapter (code-splitting benefit)
   - Fetches positions from all protocols in parallel using `Promise.allSettled`
   - Handles failures gracefully (returns empty array for failed protocols)

3. **Type Safety**: The return type is automatically generated from the `Protocol` union type using `Record<Protocol, LendingPosition[]>`

## Adding a New Protocol

### Step 1: Update the Protocol Type

Edit `src/types/lending.ts`:

```typescript
export type Protocol = 'aave' | 'compound' | 'morpho' | 'newprotocol'
```

### Step 2: Create the Adapter

Create `src/lib/protocols/newprotocol/index.ts`:

```typescript
import { LendingPosition } from '@/types/lending'

async function getAccountPositions(
  addresses: `0x${string}`[]
): Promise<LendingPosition[]> {
  // Implementation here
  return []
}

export const NewProtocolAdapter = {
  getAccountPositions,
}
```

### Step 3: Register in Config

Edit `src/config/protocols.ts` and add to `SUPPORTED_PROTOCOLS`:

```typescript
export const SUPPORTED_PROTOCOLS: ProtocolRegistryEntry[] = [
  // ... existing protocols
  {
    name: 'newprotocol',
    adapter: async () => {
      const { NewProtocolAdapter } = await import('@/lib/protocols/newprotocol')
      return NewProtocolAdapter
    },
  },
]
```

### Step 4: (Optional) Add Protocol Config

If your protocol needs chain-specific configuration:

```typescript
export const NEWPROTOCOL_CONFIG: Record<number, ProtocolConfig> = {
  [mainnet.id]: {
    name: 'newprotocol',
    displayName: 'New Protocol',
    chainId: mainnet.id,
    contracts: {
      // contract addresses
    },
    blockExplorer: 'https://etherscan.io',
  },
}
```

**That's it!** The rest of the application will automatically:

- Fetch positions from the new protocol
- Include it in the return type
- Handle errors gracefully

## Removing a Protocol

### Step 1: Remove from Registry

Remove the entry from `SUPPORTED_PROTOCOLS` in `src/config/protocols.ts`

### Step 2: Update the Protocol Type

Remove from the union in `src/types/lending.ts`:

```typescript
export type Protocol = 'aave' | 'compound' // removed 'morpho'
```

**Done!** The application will automatically stop fetching from that protocol.

## Benefits

### ✅ Single Source of Truth

- All protocol configuration in one place
- No need to update multiple files

### ✅ Type Safety

- Return types automatically generated from `Protocol` union
- TypeScript catches mismatches at compile time

### ✅ Code Splitting

- Dynamic imports enable lazy loading
- Only load adapters when needed

### ✅ Error Resilience

- `Promise.allSettled` ensures one protocol failure doesn't break others
- Failed protocols return empty arrays with logged errors

### ✅ Scalability

- Easy to add new protocols
- Easy to temporarily disable protocols (comment out registry entry)
- No hardcoded protocol names in business logic

## Example: Temporarily Disable a Protocol

Simply comment out the entry in `SUPPORTED_PROTOCOLS`:

```typescript
export const SUPPORTED_PROTOCOLS: ProtocolRegistryEntry[] = [
  {
    name: 'morpho',
    adapter: async () => {
      const { MorphoAdapter } = await import('@/lib/protocols/morpho')
      return MorphoAdapter
    },
  },
  // Temporarily disabled
  // {
  //   name: 'aave',
  //   adapter: async () => {
  //     const { AaveAdapter } = await import('@/lib/protocols/aave')
  //     return AaveAdapter
  //   },
  // },
  {
    name: 'compound',
    adapter: async () => {
      const { CompoundAdapter } = await import('@/lib/protocols/compound')
      return CompoundAdapter
    },
  },
]
```

The app will automatically stop fetching from Aave without any other code changes.
