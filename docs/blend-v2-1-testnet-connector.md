# Blend v2.1 Testnet Connector

This document describes the example connector that reads one Blend v2.1 testnet
pool through LendWise's general Stellar adapter interface. The general
tranche 1 and tranche 2 work is protocol-agnostic. This connector is an example
of connecting a real lending protocol to that layer, not a protocol-specific
deliverable.

## Scope

- Reads user supply and borrow positions from one Blend v2.1 testnet pool.
- Implements `StellarAppAdapter` (`src/config/protocols-server.ts`), the same
  interface used by the existing Stellar testnet fixture.
- Is registered under the `blend_v2` key in `STELLAR_APP_ADAPTERS`. The
  fixture stays registered under `blend_v1`, so both run for the same
  addresses and the portfolio merge handles the results.
- Does not write to the chain. It performs read-only Soroban RPC calls.

Out of scope: Blend rate-parameter fields, emissions claims, supply, borrow
and withdraw actions, and the optimizer ranking for Stellar pools.

## Files

| File                                                        | Purpose                                           |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `src/lib/protocols/stellar/testnet/blend-v2-1-pool.ts`      | Adapter, pool constant, pure mapping functions    |
| `src/lib/protocols/stellar/testnet/blend-v2-1-pool.test.ts` | Unit tests for the mapping functions (no network) |
| `src/config/protocols-server.ts`                            | Registry entry under `blend_v2`                   |

## Pool Discovery

The pool was found from public sources, not from documentation. The steps below
can be repeated to confirm the ID or to find a newer deployment.

1. The August 2026 Comet AMM incident in `blend-ui` has commits dated 25 to 27
   August 2026, which disable pool joins and backstop deposits. The
   `blend-utils` testnet file was last changed on 18 December 2025, so it
   predates that incident and does not list the v2.1 contracts.
2. `blend-ui` PR #238, "Support Blend v2.1 pools", was merged on 4 October 2026. Its description says the testnet "includes an active v2.1 pool
   mirroring TestnetV2".
3. The raw `.env.testnet` at commit `a10974f661ad646c701c10203739aca7ee03aa3a`
   sets `NEXT_PUBLIC_BACKSTOP_V2_1=CBGSFY6NR5TSCQJH5EGVMCFTHLZBCAO7YPIW426WSD46V3TESPA3U6DI`.
   Read it with `curl` from `raw.githubusercontent.com`, not from a summary.
4. A read of that backstop on testnet returns a reward zone with one pool:
   `CB3447A446DY3USGWPIDXTNQHF5EX24XDQA2EN6TAZP62JTPBTNOA52Q`.
5. Loading that pool shows:
   - `backstop` is the v2.1 backstop above.
   - `oracle` is `CAZOKR2Y5E2OSWSIBRVZMJ47RUTQPIGVWSAQ2UISGAVC46XKPGDG5PKI`, the
     same oracle as TestnetV2.
   - `reserveList` has four assets: XLM, wETH, wBTC and USDC, the same set as
     TestnetV2.
   - `status` is `1`. TestnetV2 is `0`. The meaning of `1` was not confirmed
     against Blend's status enum, so check it before relying on the pool for
     writes.

All contract IDs were validated with `StrKey.isValidContract`.

Note on sources: a model-generated summary of `.env.testnet` gave a different
V2.1 backstop ID and a different USDC issuer. Always confirm IDs against the
raw file.

## Configuration

| Variable                             | Default                               | Effect                                                |
| ------------------------------------ | ------------------------------------- | ----------------------------------------------------- |
| `STELLAR_BLEND_V2_1_TESTNET_POOL_ID` | `CB3447A4…NOA52Q`                     | Pool to read. Override to connect another Blend pool. |
| `STELLAR_RPC_URL`                    | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint                                  |
| `STELLAR_NETWORK_PASSPHRASE`         | `Test SDF Network ; September 2015`   | Network passphrase                                    |

To connect a different pool, set `STELLAR_BLEND_V2_1_TESTNET_POOL_ID`. The
adapter reads that pool's reserves and oracle from its metadata, so no code
change is needed for a pool that uses the same v2 contracts.

## Data Flow

1. `PoolV2.load` reads pool metadata and reserves.
2. `PoolOracle.load` reads prices for the pool's reserve list.
3. For each user address, `PoolUser.load` reads that user's positions.
4. Per reserve, the adapter reads:
   - supplied amount (`getSupplyFloat`)
   - collateral amount (`getCollateralFloat`)
   - borrowed amount (`getLiabilitiesFloat`)
   - price (`getPriceFloat`)
   - supply APY (`estSupplyApy`)
5. Health factor = `totalEffectiveCollateral / totalEffectiveLiabilities`,
   from `PositionsEstimate.build`. It is `0` when the user has no liabilities.
6. Pure mapping functions turn the readings into `SupplyPosition` and
   `BorrowPosition` rows. Each row has `protocol: 'blend_v2'` and
   `network: 'Stellar Testnet'`.

Each user's positions are read in parallel. Supply and collateral are added
together into one supply row per reserve.

## Mapping Rules

- A supply row is created only when supplied plus collateral is greater than zero.
- A borrow row is created only when borrowed is greater than zero.
- Asset symbols come from a fixed label table for the four testnet assets.
  Unknown assets show a six-character prefix of the asset ID. Decimals and
  prices always come from the chain.
- APY is passed through as a fraction, the same unit the existing adapters use.
- `loanLiabilityWeight` is `null` and `collaterals` is an empty array. The
  per-collateral breakdown is not mapped yet.

## Verification Performed

- Checksums of all three contract IDs in the discovery steps: valid.
- Live read of the v2.1 backstop, the pool metadata and the pool reserves
  on testnet: succeeded.
- Live call of `getUserSupplyPositions` and `getUserBorrowPositions` for a freshly
  generated address with no positions: succeeded, returning zero rows for each.
- Unit tests for the mapping functions: 6 passing.

Not yet verified: a funded test address with real supply, collateral or borrow
balances. The positive path (rows with real amounts and a real health factor)
needs a wallet with a position in this pool.

## Running The Checks

```bash
npx vitest run src/lib/protocols/stellar/testnet/blend-v2-1-pool.test.ts
```

A live smoke check is a short `tsx` script that calls the adapter with a fresh
address. Run it from the repo root so the `@/` aliases resolve.

## Operational Notes

- The v2.1 backstop holds no BLND. Emissions accrue as credit and claims stay
  disabled until BLND is sent to the backstop (per the blend-ui PR #238
  description). The connector does not read emissions.
- The August 2026 Comet incident paused backstop operations. The connector reads
  pool positions only, so a paused backstop does not stop reads, but it does
  affect the backstop data the pool depends on.
- Pool status is not interpreted. Check it before using this pool for any
  write action.
- The connector depends on `@blend-capital/blend-sdk` 3.3.0 (see `package.json`).
  Upgrading the SDK can change the `PoolV2`, `PoolUser` and `PositionsEstimate`
  APIs.

## Next Steps

1. Fund a testnet wallet and open a position in this pool, then verify the
   positive path end to end in the portfolio UI.
2. Confirm the meaning of pool status `1` against the Blend contract enum.
3. Add per-collateral breakdown and liability weights if the portfolio UI needs them.
4. Decide whether this connector should replace the fixture for `blend_v2`
   on testnet, or stay alongside it.
