# `apy.spot` Collection — Schema Reference

The `apy.spot` collection is a **MongoDB Time Series** collection storing raw APY snapshots collected every 10 minutes across all active pools. It is the single source of truth from which `apy.daily` is derived.

All monetary values are in **USD**. All rates are in **APY** (Annual Percentage Yield) — reward APRs from source protocols are converted to APY before storage using daily compounding (n=365).

---

## Core Rules

### 1. Time Series configuration

```js
db.createCollection('apy.spot', {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'meta',
    granularity: 'minutes',
  },
  expireAfterSeconds: 7776000, // TTL: 90 days
})
```

### 2. Timestamp is the normalized slot, not the fetch time

The `timestamp` field is always rounded down to the nearest 10-minute boundary. The actual fetch time is stored in `quality.fetchedAt`.

```typescript
// Job runs at 13:17:42Z → slot is 13:10:00Z
const slotTimestamp = DateTime.utc()
  .startOf('minute')
  .set({ minute: Math.floor(DateTime.utc().minute / 10) * 10 })
  .toJSDate()
```

### 3. Upsert on (productId, timestamp) for idempotency

The collection job uses `updateOne(..., { upsert: true })` keyed on `(meta.productId, timestamp)`. Any number of QStash retries on the same slot produces exactly one document.

### 4. All rates stored as APY

Base rates from protocols are already APY. Reward APRs from Morpho and AAVE incentives are converted to APY using daily compounding before storage:

```
APY = (1 + APR / 365)^365 - 1
```

The raw APR is also stored in `rewardItems[].apr` for traceability.

### 5. `apy.net` formula

```
Supply:   net = base - fees + rewards
Borrow: net = base + fees - rewards
```

For Morpho, `net` is taken directly from `netSupplyApy` / `netBorrowApy` and cross-checked against the formula. For AAVE, it is computed from the components.

### 6. `meta` fields are deliberately denormalized

`meta.asset` and `meta.protocol` duplicate data from `pools` to enable efficient Time Series bucket queries without a join. Keep them in sync when `pools` is updated.

---

## TypeScript Types

```typescript
import type { ProtocolName } from './pools'

// ─── Reward item ─────────────────────────────────────────────────────────────

export interface RewardItem {
  token: {
    symbol: string // "MORPHO", "AAVE", "USDC"…
    address: string // ERC-20 address of the reward token
  }
  /**
   * Raw APR as returned by the source protocol.
   * Morpho:  state.rewards[].supplyApr / borrowApr
   * AAVE:    AaveSupplyIncentive.extraSupplyApr / AaveBorrowIncentive.borrowAprDiscount
   * Merkl:   opportunity.apr
   * Stored for traceability — do not use directly for net APY calculation.
   */
  apr: number
  /**
   * APR converted to APY using daily compounding (n=365).
   * APY = (1 + APR / 365)^365 - 1
   * Use this field for all APY aggregations and net calculations.
   */
  apy: number
  /**
   * Origin of this reward item.
   * "protocol" — distributed by the protocol itself (Morpho rewards, AAVE Safety Module)
   * "merkl"    — external campaign via Merkl distribution
   * "merit"    — AAVE Merit program (off-chain points → on-chain rewards)
   */
  source: 'protocol' | 'merkl' | 'merit'
  /**
   * Human-readable program name when available.
   * Examples: "morpho-rewards-epoch-3", "aave-safety-module", "merkl-campaign-xyz"
   */
  program: string | null
}

// ─── APY breakdown ───────────────────────────────────────────────────────────

export interface ApyBreakdown {
  /**
   * Base APY from the protocol IRM — before fees deduction, without rewards.
   * Source:
   *   Morpho: state.supplyApy / state.borrowApy
   *   AAVE:   supplyInfo.apy.value / borrowInfo.apy.value
   */
  base: number

  /**
   * Sum of all reward items converted to APY.
   * = sum(rewardItems[].apy)
   * Supply:   adds to yield
   * Borrow: reduces effective cost
   */
  rewards: number

  /**
   * Protocol fee as APY — deducted from the gross rate.
   * Morpho Blue:   state.fee (set at market creation, taken from borrowers)
   * MetaMorpho:    vault performance fee (taken by the curators)
   * AAVE:          reserve factor from protocolMeta (not re-fetched here)
   * Compound:      reserveFactor from protocolMeta
   */
  fees: number

  /**
   * Net APY — effective rate for the user.
   * Supply:   base - fees + rewards
   * Borrow: base + fees - rewards
   *
   * For Morpho, cross-checked against state.netSupplyApy / state.netBorrowApy.
   * For AAVE, computed from components above.
   */
  net: number

  /**
   * Individual reward breakdown — one entry per (token, program) pair.
   * Empty array when no active reward programs.
   */
  rewardItems: RewardItem[]
}

// ─── Market state ─────────────────────────────────────────────────────────────

export interface MarketState {
  /**
   * Total value supplied to this pool in USD.
   * Morpho: state.supplyAssetsUsd
   * AAVE:   supplyInfo.total.value × usdExchangeRate
   */
  supplyAssetsUsd: number

  /**
   * Total value borrowed from this pool in USD.
   * Morpho: state.borrowAssetsUsd
   * AAVE:   borrowInfo.total.usd
   */
  borrowAssetsUsd: number

  /**
   * Borrow utilization rate — 0 to 1.
   * = borrowAssetsUsd / supplyAssetsUsd
   * Morpho: state.utilization (direct)
   * AAVE:   computed
   */
  utilizationRate: number

  /**
   * Price of the loan asset in USD at the time of the snapshot.
   * Morpho: not directly exposed — derived from supplyAssets / supplyAssetsUsd
   * AAVE:   usdExchangeRate
   */
  assetPriceUsd: number
}

// ─── Quality metadata ─────────────────────────────────────────────────────────

export interface SpotQuality {
  /**
   * "ok"      — all fields populated from source
   * "partial" — one or more market fields could not be fetched or computed
   * "stale"   — job retried and reused a previous value for missing fields
   */
  status: 'ok' | 'partial' | 'stale'

  /**
   * Actual timestamp when the subgraph was queried.
   * Differs from the slot timestamp when the job is delayed or retried.
   */
  fetchedAt: Date

  /**
   * Incremented each time this slot is recomputed (QStash retry, manual replay).
   * Starts at 1.
   */
  revision: number
}

// ─── Spot document ────────────────────────────────────────────────────────────

export interface ApySpot {
  /**
   * Slot timestamp — normalized to the 10-minute boundary (UTC).
   * 13:17:42Z → 13:10:00.000Z
   * Part of the compound upsert key: (meta.productId, timestamp).
   */
  timestamp: Date

  /**
   * Bucketing metadata for Time Series — stored in the metaField.
   * Deliberately denormalized from pools for query efficiency.
   */
  meta: {
    productId: string // FK → pools._id
    kind: 'supply' | 'borrow'
    protocol: ProtocolName // "aave" | "morpho" | "compound"
    chain: {
      id: number
      name: string
    }
    asset: string // "USDC" — loan asset symbol
  }

  /**
   * APY breakdown — all rates as APY, rewards converted from APR.
   */
  apy: ApyBreakdown

  /**
   * Market state at the time of the snapshot.
   */
  market: MarketState

  /**
   * Data quality indicators — populated by the collection job.
   */
  quality: SpotQuality
}
```

---

## Source Mapping Reference

### Morpho Blue

| `apy.spot` field         | Morpho source                                       |
| ------------------------ | --------------------------------------------------- |
| `apy.base` (supply)      | `state.supplyApy`                                   |
| `apy.base` (borrow)      | `state.borrowApy`                                   |
| `apy.fees`               | `state.fee`                                         |
| `apy.rewards` (supply)   | `sum(state.rewards[].supplyApr)` → converted to APY |
| `apy.rewards` (borrow)   | `sum(state.rewards[].borrowApr)` → converted to APY |
| `apy.net` (supply)       | `state.netSupplyApy` (cross-check with formula)     |
| `apy.net` (borrow)       | `state.netBorrowApy` (cross-check with formula)     |
| `rewardItems[].apr`      | `state.rewards[].supplyApr` or `borrowApr`          |
| `rewardItems[].source`   | `"protocol"`                                        |
| `market.supplyAssetsUsd` | `state.supplyAssetsUsd`                             |
| `market.borrowAssetsUsd` | `state.borrowAssetsUsd`                             |
| `market.utilizationRate` | `state.utilization`                                 |
| `market.assetPriceUsd`   | `supplyAssetsUsd / supplyAssets`                    |

### AAVE

| `apy.spot` field         | AAVE source                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| `apy.base` (supply)      | `supplyInfo.apy.value`                                                       |
| `apy.base` (borrow)      | `borrowInfo.apy.value`                                                       |
| `apy.fees`               | `protocolMeta.reserveFactor` (from `pools`, not re-fetched)                  |
| `apy.rewards` (supply)   | `sum(AaveSupplyIncentive.extraSupplyApr)` + `sum(Merkl supply APR)` → APY    |
| `apy.rewards` (borrow)   | `sum(AaveBorrowIncentive.borrowAprDiscount)` + `sum(Merkl borrow APR)` → APY |
| `apy.net` (supply)       | computed: `base - fees + rewards`                                            |
| `apy.net` (borrow)       | computed: `base + fees - rewards`                                            |
| `rewardItems[].source`   | `"protocol"` (AAVE native) or `"merkl"` or `"merit"`                         |
| `market.supplyAssetsUsd` | `supplyInfo.total.value × usdExchangeRate`                                   |
| `market.borrowAssetsUsd` | `borrowInfo.total.usd`                                                       |
| `market.utilizationRate` | computed: `borrowAssetsUsd / supplyAssetsUsd`                                |
| `market.assetPriceUsd`   | `usdExchangeRate`                                                            |

---

## APR → APY Conversion

All reward APRs are converted before storage using **daily compounding (n=365)**:

```typescript
function aprToApy(apr: number): number {
  return Math.pow(1 + apr / 365, 365) - 1
}

// Examples
aprToApy(0.05) // 5% APR  → 5.126% APY
aprToApy(0.12) // 12% APR → 12.747% APY
aprToApy(0.01) // 1% APR  → 1.005% APY
```

---

## Recommended MongoDB Indexes

```js
// Primary — fetch latest spot for a pool
db['apy.spot'].createIndex({ 'meta.productId': 1, timestamp: -1 })

// UI query — "all supply pools for USDC on Ethereum over last 7 days"
db['apy.spot'].createIndex({
  'meta.asset': 1,
  'meta.kind': 1,
  'meta.chain.id': 1,
  timestamp: -1,
})

// Daily job — aggregate all spots in a 24h window
db['apy.spot'].createIndex({ 'meta.protocol': 1, timestamp: -1 })
```

---

## Document Example — Morpho Blue USDC/WETH supply

```json
{
  "timestamp": "2025-03-12T14:10:00.000Z",
  "meta": {
    "productId": "morpho-MorphoBlueEthereum-usdc-weth-supply",
    "kind": "supply",
    "protocol": "morpho",
    "chain": { "id": 1, "name": "ethereum" },
    "asset": "USDC"
  },
  "apy": {
    "base": 0.0421,
    "rewards": 0.00771,
    "fees": 0.001,
    "net": 0.0488,
    "rewardItems": [
      {
        "token": { "symbol": "MORPHO", "address": "0x58D97B..." },
        "apr": 0.0077,
        "apy": 0.00771,
        "source": "protocol",
        "program": "morpho-rewards-epoch-3"
      }
    ]
  },
  "market": {
    "supplyAssetsUsd": 45200000,
    "borrowAssetsUsd": 32100000,
    "utilizationRate": 0.71,
    "assetPriceUsd": 1.0001
  },
  "quality": {
    "status": "ok",
    "fetchedAt": "2025-03-12T14:10:07.342Z",
    "revision": 1
  }
}
```
