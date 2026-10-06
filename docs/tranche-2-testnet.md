# Tranche 2 Testnet Runbook

This document records the Tranche 2 testnet implementation path for the portfolio risk module, Stellar wallet holdings, and graceful EVM/Stellar portfolio degradation.

## Scope

Tranche 2 adds two portfolio capabilities:

1. Standardized health-factor calculation for any reserve set.
2. Unified EVM + Stellar portfolio loading with visible partial-failure states.

The implementation is intentionally split into pure modules and adapter wiring:

- `src/lib/risk/health-factor.ts` contains the protocol-neutral formula.
- `src/lib/risk/portfolio-health.ts` adapts current UI borrow positions into risk reserves.
- `src/lib/portfolio/routing.ts` routes wallet addresses by `chainFamily`.
- `src/app/actions/user-portfolio-positions.actions.ts` merges EVM and Stellar family results.
- `src/lib/protocols/stellar/testnet/portfolio.ts` reads Stellar XLM and USDC holdings through Horizon and exposes a fixture borrow position for staging risk demos.

## Health Factor Contract

The standardized formula is:

```text
sum(collateral_i * price_i * collateral_weight_i)
/
sum(liability_i * price_i / liability_weight_i)
```

The calculator returns one of three states:

- `ok`: numeric health factor and weighted USD components are known.
- `no-liability`: no debt exists, so the health factor is infinite.
- `unknown`: at least one required price, amount, or risk weight is missing or invalid.

A missing price is never treated as zero for risk. This is important because valuing a reserve at zero can understate risk. The UI displays `Unknown` when the result is unknown.

## Stellar Portfolio Adapter

The Stellar testnet adapter is registered under `blend_v1` in `STELLAR_APP_ADAPTERS`. It currently provides:

- Native XLM balances from Horizon account balances.
- USDC trustline balances from Horizon account balances.
- Optional staging borrow/collateral fixture for health-factor demos.

The adapter ignores unrelated trustlines by default and only includes USDC for the configured issuer. If Horizon cannot load the configured fixture address, the fixture balances are used so staging demos do not depend on the public testnet endpoint being healthy. Non-fixture addresses still fail closed into the partial-data path when Horizon is unreachable.

## Environment

Core Stellar environment. The same keys are listed in `.env.example`:

```text
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_PORTFOLIO_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_TESTNET_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

`STELLAR_PORTFOLIO_HORIZON_URL` is optional. If absent, the adapter falls back to `STELLAR_HORIZON_URL`, then to the public/testnet default based on `STELLAR_NETWORK_PASSPHRASE`.

Prices used by the current portfolio UI fixture path:

```text
STELLAR_TESTNET_FIXTURE_XLM_PRICE_USD=0.12
STELLAR_TESTNET_FIXTURE_USDC_PRICE_USD=1
```

Staging fixture account and wallet holdings fallback for unfunded accounts:

```text
STELLAR_TESTNET_FIXTURE_ADDRESS=G...
STELLAR_TESTNET_FIXTURE_XLM=1000
STELLAR_TESTNET_FIXTURE_USDC=250
```

Staging borrow/collateral fixture:

```text
STELLAR_TESTNET_FIXTURE_BORROW_USDC=100
STELLAR_TESTNET_FIXTURE_COLLATERAL_XLM=2000
STELLAR_TESTNET_FIXTURE_COLLATERAL_WEIGHT=0.5
```

Partial-failure demo switch:

```text
STELLAR_TESTNET_PORTFOLIO_OFFLINE=true
```

When this is set, the Stellar adapter throws and the portfolio page should still render EVM positions with a visible partial-data banner.

## Success Criteria Demo

### Health Factor

1. Configure the Stellar fixture address and borrow/collateral env vars.
2. Connect the matching Stellar testnet wallet.
3. Open `/portfolio`.
4. Confirm the Health value is computed from the fixture reserve weights and prices.
5. Remove `STELLAR_TESTNET_FIXTURE_XLM_PRICE_USD` or set it blank.
6. Reload `/portfolio`.
7. Confirm the Health value displays `Unknown` and the risk/valuation warning is visible.

### EVM + Stellar Merge

1. Connect an EVM wallet with an Aave/Morpho/Compound position.
2. Connect a Stellar wallet with XLM or configured USDC trustline holdings.
3. Open `/portfolio`.
4. Confirm EVM and Stellar positions appear in the same tables.
5. Set `STELLAR_TESTNET_PORTFOLIO_OFFLINE=true` in staging.
6. Reload `/portfolio`.
7. Confirm EVM positions still render and the partial-data banner names the failing Stellar adapter.

## Daily Aggregation Check

No new daily aggregation work is required for Stellar rates. `aggregateDaily` in `src/lib/db/repositories/apy.ts` reads `apy_hourly`, joins `products`, and groups by `product_id`; it does not hard-code EVM providers. Any Stellar protocol that writes standardized hourly rows and has a products row is covered by the same aggregation path.

## Verification Notes

The local workspace currently lacks installed project binaries, so these commands do not start until dependencies are restored:

```text
npm run typecheck  # tsc: not found
npm run lint       # eslint: not found
npm run test       # vitest: not found
```

`git diff --check` should still be run after edits; it validates whitespace and patch hygiene even without dependencies installed.
