# `pools` Collection — Schema Reference

The `pools` collection is a **static registry** of all lending and borrowing pools across AAVE, Morpho, and Compound. It holds metadata only — no time-varying metrics. All APY, TVL, and rate data lives in `apy.spot` and `apy.daily`.

---

## Core Rules

### 1. One document per side

A single on-chain market always generates **two pool documents** — one with `kind: "lend"` and one with `kind: "borrow"`. This is true even for AAVE reserves, where both sides share the same `native.id`. Splitting by `kind` keeps all GraphQL resolvers and aggregation queries uniform across protocols.

### 2. `_id` is a deterministic slug

The `_id` is built at collection time, never auto-generated. Format:

```
{protocol.name}-{protocol.market}-{asset.symbol}-{kind}
```

For Morpho Blue borrow pools, the collateral symbol is appended:

```
morpho-MorphoBlueEthereum-usdc-weth-borrow
```

This makes pool lookups predictable from the job layer without a prior query.

### 3. `protocol.market` is verbatim from the subgraph

Never normalize or transform the market name returned by the protocol's GraphQL API. Store it as-is (`"AaveV3EthereumLido"`, `"MorphoBlueEthereum"`…). This way new protocol deployments are picked up automatically by the collection job without any schema change.

### 4. `LendPool` and `BorrowPool` are distinct types

The TypeScript model uses a **discriminated union** on `kind`. `collaterals` only exists on `BorrowPool` — it is entirely absent from `LendPool`, not set to `[]`. This eliminates a class of runtime bugs where lend-side code accidentally accesses collateral data.

- `BorrowPool.collaterals` is always a non-empty array — one element on Morpho Blue (fixed at market creation), N elements on AAVE / Compound built dynamically from reserves where `supplyInfo.canBeCollateral === true`
- `protocolMeta` is also narrowed per side — `ProtocolMetaMorphoBlue` only appears on borrow, `ProtocolMetaMetaMorpho` only on lend

The collateral **does not influence borrow APY** on AAVE or Compound (same rate regardless of what you deposit). It does influence APY on Morpho Blue since each `(loanToken, collateralToken, lltv)` tuple is a distinct market with its own liquidity.

### 5. `protocolMeta` contains only stable IRM parameters

Only fields that are **fixed by governance** and do not change over time belong in `protocolMeta`. Variable metrics (current APY, utilization rate, TVL) are never stored here — they belong exclusively in `apy.spot` and `apy.daily`.

### 6. `collaterals` must be refreshed on governance changes

Unlike most fields in `pools`, the collateral list can be updated via on-chain governance (new asset added, LTV modified). The collection job must detect changes and update `collaterals` accordingly, bumping `updatedAt`.

---

## TypeScript Types

```typescript
// ─── Shared primitives ───────────────────────────────────────────────────────

export type ProtocolName = 'aave' | 'morpho' | 'compound'

export type NativeType = 'reserve' | 'market' | 'vault' | 'comet'

export interface Chain {
  id: number // EVM chain ID — 1 = Ethereum, 8453 = Base, 42161 = Arbitrum…
  name: string // "ethereum" | "base" | "arbitrum" | "polygon"…
}

// ─── Asset ───────────────────────────────────────────────────────────────────

export interface Asset {
  symbol: string // "USDC"
  name: string // "USD Coin"
  address: string // ERC-20 contract address
  decimals: number // 6 for USDC, 18 for WETH…
}

// ─── Collateral (borrow only) ─────────────────────────────────────────────────

export interface Collateral {
  symbol: string
  name: string
  address: string
  decimals: number
  /**
   * Maximum LTV allowed to open a borrow position.
   * null for Morpho Blue — the protocol only exposes lltv.
   */
  ltv: number | null
  /**
   * Liquidation threshold — position becomes liquidatable above this LTV.
   * Present on all three protocols.
   */
  lltv: number
  /**
   * Whether this asset can be used as collateral on this specific market.
   * Sourced from AAVE's supplyInfo.canBeCollateral.
   * Always true for Morpho Blue (collateral is fixed at market creation).
   */
  canBeCollateral: boolean
}

// ─── Protocol meta ───────────────────────────────────────────────────────────

/**
 * AAVE lend — supply-side token reference, fixed at reserve creation.
 */
export interface ProtocolMetaAaveLend {
  /** aToken received when supplying (e.g. "aEthLidoUSDC") */
  aTokenSymbol: string
}

/**
 * AAVE borrow — IRM parameters fixed by governance.
 * Source: reserve.interestRateStrategyAddress on-chain or subgraph.
 */
export interface ProtocolMetaAaveBorrow {
  /** IRM slope below the optimal usage rate */
  variableRateSlope1: number
  /** IRM slope above the optimal usage rate (steep kink) */
  variableRateSlope2: number
  /** Utilization rate at which the kink occurs */
  optimalUsageRate: number
  /** Base borrow rate at 0% utilization */
  baseVariableBorrowRate: number
  /** Variable debt token symbol (e.g. "variableDebtEthLidoUSDC") */
  vTokenSymbol: string
}

/**
 * Morpho Blue borrow — market configuration, immutable after deployment.
 * Source: Market entity on the Morpho subgraph.
 */
export interface ProtocolMetaMorphoBlue {
  /** Oracle contract address used for collateral price feeds */
  oracle: string
  /** IRM contract address */
  irm: string
}

/**
 * MetaMorpho lend — vault configuration.
 * Source: Vault entity on the Morpho subgraph.
 */
export interface ProtocolMetaMetaMorpho {
  /** Vault curator name (e.g. "Steakhouse", "Gauntlet") */
  curator: string
  /** List of Morpho Blue marketIds this vault allocates liquidity to */
  underlyingMarkets: string[]
}

/**
 * Compound — market parameters fixed by governance.
 * Applies to both lend and borrow sides.
 */
export interface ProtocolMetaCompound {
  /** Fraction of interest redirected to the protocol reserve (e.g. 0.10) */
  reserveFactor: number
  /** cToken or Comet share token symbol (e.g. "cUSDCv3") */
  cTokenSymbol: string
}

// ─── Base pool (shared fields) ────────────────────────────────────────────────

interface BasePool {
  /**
   * Deterministic slug — primary key.
   * Format: {protocol.name}-{protocol.market}-{asset.symbol}-{kind}
   * For Morpho Blue borrow: …-{collateral.symbol}-borrow
   *
   * Examples:
   *   aave-AaveV3Ethereum-usdc-lend
   *   aave-AaveV3EthereumLido-wsteth-borrow
   *   morpho-MorphoBlueEthereum-usdc-weth-borrow
   *   morpho-MetaMorphoEthereum-usdc-steakhouse-lend
   *   compound-CompoundV3Ethereum-usdc-lend
   */
  _id: string

  protocol: {
    /** Normalized protocol identifier — use for filtering and grouping */
    name: ProtocolName
    /**
     * Native market name, verbatim from the protocol subgraph.
     * Never transform — new deployments are detected automatically.
     * Examples: "AaveV3Ethereum", "AaveV3EthereumLido", "MorphoBlueEthereum"
     */
    market: string
    chain: Chain
    /** Address of the main protocol contract (Pool / Market / Comet) */
    address: string
  }

  native: {
    /** How this pool is represented in the source protocol */
    type: NativeType
    /**
     * Native identifier in the source protocol.
     * AAVE: underlying asset address (reserve identifier)
     * Morpho Blue: marketId hash
     * MetaMorpho: vault contract address
     * Compound: cToken or Comet address
     */
    id: string
  }

  /** The asset being lent or borrowed */
  asset: Asset

  /** Subgraph URL queried by the collection job */
  subgraphUrl: string

  /**
   * Set to false when a pool is deprecated.
   * Never delete — historical spot/daily data references this document.
   */
  active: boolean

  createdAt: Date
  /**
   * Updated when governance changes affect collaterals or protocolMeta.
   * The collection job is responsible for detecting and applying these changes.
   */
  updatedAt: Date
}

// ─── Discriminated union ──────────────────────────────────────────────────────

export interface LendPool extends BasePool {
  kind: 'lend'
  /**
   * Lend-side protocol parameters, stable over time.
   * Never contains variable metrics (APY, utilization, TVL).
   * Note: ProtocolMetaMorphoBlue is borrow-only and does not appear here.
   */
  protocolMeta:
    | ProtocolMetaAaveLend
    | ProtocolMetaMetaMorpho
    | ProtocolMetaCompound
}

export interface BorrowPool extends BasePool {
  kind: 'borrow'
  /**
   * List of accepted collateral assets. Always non-empty on a borrow pool.
   * One element on Morpho Blue (fixed at market creation).
   * N elements on AAVE / Compound (filtered to canBeCollateral === true).
   */
  collaterals: Collateral[]
  /**
   * Borrow-side protocol parameters, stable over time.
   * Never contains variable metrics (APY, utilization, TVL).
   * Note: ProtocolMetaMetaMorpho is lend-only and does not appear here.
   */
  protocolMeta:
    | ProtocolMetaAaveBorrow
    | ProtocolMetaMorphoBlue
    | ProtocolMetaCompound
}

export type Pool = LendPool | BorrowPool

// ─── Usage example ────────────────────────────────────────────────────────────

function processPool(pool: Pool) {
  if (pool.kind === 'borrow') {
    pool.collaterals // ✅ TypeScript knows this exists
  } else {
    pool.collaterals // ❌ compile error — collaterals does not exist on LendPool
  }
}
```

---

## `_id` Construction Reference

| Protocol    | Kind   | Pattern                                       | Example                                          |
| ----------- | ------ | --------------------------------------------- | ------------------------------------------------ |
| AAVE        | lend   | `aave-{market}-{asset}-lend`                  | `aave-AaveV3Ethereum-usdc-lend`                  |
| AAVE        | borrow | `aave-{market}-{asset}-borrow`                | `aave-AaveV3EthereumLido-wsteth-borrow`          |
| Morpho Blue | lend   | `morpho-{market}-{asset}-lend`                | `morpho-MorphoBlueEthereum-usdc-lend`            |
| Morpho Blue | borrow | `morpho-{market}-{asset}-{collateral}-borrow` | `morpho-MorphoBlueEthereum-usdc-weth-borrow`     |
| MetaMorpho  | lend   | `morpho-{market}-{asset}-{curator}-lend`      | `morpho-MetaMorphoEthereum-usdc-steakhouse-lend` |
| Compound    | lend   | `compound-{market}-{asset}-lend`              | `compound-CompoundV3Ethereum-usdc-lend`          |
| Compound    | borrow | `compound-{market}-{asset}-borrow`            | `compound-CompoundV3Ethereum-usdc-borrow`        |

---

## Recommended MongoDB Indexes

```js
// Primary access pattern — filter by protocol, asset, kind
db.pools.createIndex({ 'protocol.name': 1, 'asset.symbol': 1, kind: 1 })

// Lookup by native ID (used by the collection job on upsert)
db.pools.createIndex({ 'native.id': 1, 'protocol.name': 1 }, { unique: true })

// Active pools by chain
db.pools.createIndex({ active: 1, 'protocol.chain.id': 1 })
```
