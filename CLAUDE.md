# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

DeFi yield optimization platform: aggregates and compares supply/borrow positions on Aave V3, Morpho Blue/MetaMorpho, and Compound V3 across multiple chains (Ethereum, Polygon, Arbitrum, Base, Optimism).

**Stack:** Next.js 15 (App Router) · TypeScript strict · Tailwind 4 + Radix UI · viem/wagmi · MongoDB · The Graph (GraphQL) · graphql-yoga · URQL · Zustand · QStash (cron)

---

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Dev server → localhost:3000
pnpm build            # codegen + next build
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm format:check     # Prettier check
pnpm codegen          # Regenerate GraphQL types (from schema + protocol subgraphs)
pnpm codegen:clean    # Wipe generated/ folders then regenerate
pnpm db:init          # Create MongoDB collections + indexes (idempotent)
pnpm run products:sync     # Sync pools to DB
pnpm run test:collateral   # Manual collateral validation (Aave)
```

No test runner is configured — code quality relies on TypeScript strict mode and ESLint.

---

## Architecture

### Data pipeline

```
QStash cron (every 10 min)
  → POST /api/yield/apy/spot
  → collectApySpot() server action
  → Protocol adapters (Aave/Morpho/Compound GraphQL + on-chain)
  → MongoDB upsert: apy.hourly

QStash cron (daily 00:10 UTC)
  → POST /api/yield/apy/daily
  → Aggregates apy.hourly → apy.daily

graphql-yoga at /api/graphql
  ← URQL client (React components)
```

### Protocol adapters (`src/lib/protocols/`)

Each protocol has `offchain/` (protocol GraphQL API) and/or `onchain/` (The Graph subgraph) adapters. Add a new protocol by:

1. Adding to `Protocol` union in `src/types/supplying.ts`
2. Creating `src/lib/protocols/{name}/index.ts` with `getAccountPositions`
3. Registering in `SUPPORTED_PROTOCOLS` in `src/config/protocols.ts`

`Promise.allSettled` is used everywhere multiple sources are aggregated — one failure doesn't block others. To disable a protocol temporarily, comment its entry in `SUPPORTED_PROTOCOLS`.

### Compound V3 chain overrides

Compound V3 subgraphs differ by chain (Messari vs Spencer schema). Override pattern: `src/lib/protocols/compound/v3/onchain/{chainName}/` with `queries.ts`, `transformers.ts`, `index.ts` calling `registerChain(...)`. Runtime uses the chain-specific version if present, else default.

---

## MongoDB

3 collections:

### `products` — static registry
- One doc per market side: `_id = {protocol}-{market}-{asset}-{kind}` (e.g. `aave-AaveV3Ethereum-usdc-supply`)
- `kind: "supply" | "borrow"` — primary discriminant
- No real-time metrics

### `apy.hourly` — rolling averages (classic collection, upserted every 10 min)
- Upsert key: `(productId, hour)` — idempotent
- All rates stored as **APY** (reward APR converted before storage)
- Net formula: Supply = `base - fees + rewards` / Borrow = `base + fees - rewards`
- TTL: 180 days

### `apy.daily` — daily aggregates (classic collection)
- Aggregated from `apy.hourly`, window `[D-1 00:00Z, D 00:00Z[`
- APY/utilization = mean of day · TVL = closing value
- Full distribution stored: `{ avg, min, max, p25, p75, stdDev }`
- `quality.completeness < 0.5` → unreliable, exclude from optimization engine

---

## GraphQL

- **Server:** `graphql-yoga` at `/api/graphql` — schema in `src/lib/graphql/schema.ts`, resolvers in `src/lib/graphql/resolvers.ts`
- **Client:** URQL (React, suspense-compatible)
- **Codegen:** `@graphql-codegen/cli` — generates types into `src/**/generated/` from schema + subgraph introspection. Run before build (`pnpm build` does this automatically).

---

## Token icons

Single component `<TokenIcon symbol="USDC" size={24} />`.

Resolution priority:
1. `/public/icons/native/{symbol}.svg` — instant
2. `localStorage` — client-side persistence
3. Server memory cache — 24h
4. CoinGecko API — fallback (50 calls/min, 1 call/token/24h)

Internal API: `GET /api/token-icon?symbol=BTC`

Fiat currencies: `<CurrencyIcon currency="USD" />` → financial-flag-icons.

---

## Code rules

- **TypeScript strict** — no `any`
- **Functional only** — no classes
- **RPC batching** — group on-chain calls as much as possible
- **Promise.allSettled** wherever multiple sources are aggregated
- **APR → APY**: always `(1 + APR/365)^365 - 1` before storage

---

## Known issues

**rsETH on AaveV3Arbitrum**: GraphQL API returns `canBeCollateral: false` while Aave UI shows `true`. Code is correct (trusts official API). See `docs/aave-collateral-discrepancies.md`.

---

## Environment variables

```env
# MongoDB
MONGODB_URI=
MONGODB_DB_NAME=
MONGODB_COLLECTION_PRODUCTS=
MONGODB_COLLECTION_HOURLY=
MONGODB_COLLECTION_DAILY=

# Cron security
CRON_SECRET=                        # Bearer token for /api/cron/sync-history
UPSTASH_QSTASH_TOKEN=               # QStash signature verification

# External APIs
THEGRAPH_API_KEY=
NEXT_PUBLIC_INFURA_API_KEY=
OPTIMIZER_API_URL=                  # External optimizer service (also used by codegen:optimizer)

# Wallet / frontend
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_ENABLE_TESTNETS=false
NEXT_PUBLIC_API_URL=
```
