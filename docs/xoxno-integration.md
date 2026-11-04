# XOXNO Lending

`xoxno_v1` supplies market discovery, rates/history and Stellar wallet positions through the existing protocol registries. Production reads mainnet; testnet is confined to injected clients and isolated fixtures. Lending transactions remain in XOXNO's app.

## Data contract

- One product per network, controller, hub, token contract and side. Spokes are risk variants, not additional liquidity pools. Names and symbols never determine identity.
- `/stellar-lending/context` discovers reserves; `hubPool` supplies shared balances. V1 collateral and borrow assets supply display metadata and capacity estimates. `/markets/detailed` determines price validity.
- Spot APY is fractional. Supply net APY already includes the reserve factor. Historical net APY comes directly from the graph; unavailable historical gross/fee components remain null.
- Cash is explicit and may differ from deposits minus debt. The ingestion boundary derives cash only when a legacy adapter omits the field; explicit null stays unknown.
- Wallet positions follow every pagination link and retain separate NFT/account identities. Reported health factors are labelled indexed estimates and are never repriced through the generic risk engine. Unknown balances and valuations remain visible.

Use the existing protocol filter to select XOXNO and clear display floors through Filters to include smaller markets. Select markets normally; choose account rules (a spoke) and, for borrowing, an exact collateral hub/token in the optimizer's selection review. Global collateral labels carry no risk parameters until a spoke is selected.

## Optimizer checks

The combined server action reloads catalogue identities, validates selections, reads current controller/pool state and oracle indexes, then calls the existing solver. Contracts and RPC URLs come from server configuration. Each allocation models a new account with one supply and one debt leg.

Checks include hub/spoke activity, pause/freeze flags, scaled caps, share rounding, opening LTV, minimum weighted collateral, shared liquidity and the liquidation buffer. Conservative limits account for pending protocol revenue shares. Unsupported candidates are excluded with a reason. Post-solver checks enforce aggregate caps and exact token budgets.

Verification expires after 30 seconds, including solver time. Its ledger range records a bounded observation window, not an atomic snapshot or an execution guarantee. A wallet must simulate a later transaction before signing.

## Validation and rollout

Use Node 24 and the pinned package manager. `RPC_URL_STELLAR` can point to a keyless mainnet RPC for validation. `THEGRAPH_API_KEY` remains necessary for the existing Compound code generator; XOXNO's public API needs no key.

```sh
pnpm install --frozen-lockfile
pnpm adapter:test xoxno_v1
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Run migration **0006** against an isolated database first. It adds cash columns, backfills existing liquidity using the previous display calculation, and permits unknown base/fee components. PGlite integration tests exercise the actual migration and ingestion queries.

After staging verification, apply the migration before deploying the new reads. Then populate the catalogue, collect a first observation, and inspect the history dry run before writing:

```sh
pnpm db:migrate
pnpm products:sync -- --protocol xoxno_v1
pnpm collect:apy -- --protocol xoxno_v1 --write
pnpm backfill:history -- --protocol xoxno_v1 --chains -1 --days 180
pnpm backfill:history -- --protocol xoxno_v1 --chains -1 --days 180 --write
```

Set database variables for the intended environment before any write command. Backfill imports only the upstream history actually available. Monitor the existing pipeline reports for product counts, spot failures, history gaps and RPC qualification failures. Retain catalogue/history rows when an upstream fails.

Live validation on 2026-11-04 returned 25 supply products, 7 borrow products, 32 matching spot observations and no targeting leaks across a 3-product history probe. Inventory counts are evidence, never listing constants.

A read-only mainnet USDC/XLM candidate passed controller, pool, hub, spoke and oracle verification in 3.2 seconds at ledger 65291513. No transaction was signed or submitted. Production database migration and deployment are separate rollout steps.
