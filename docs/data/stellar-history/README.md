# Stellar historical data — published output

Hourly market state of a Soroban lending contract, reconstructed from
[Stellar Hubble](https://developers.stellar.org/docs/data/analytics/hubble) (the public
BigQuery mirror of the Stellar ledger) by `src/lib/protocols/stellar/hubble-history.ts` and
the Blend decoder (`src/lib/protocols/blend/common/apy-history.ts`). See
[docs/architecture-stellar-integration.md](../../architecture-stellar-integration.md), part 2.

## Files

| File                                                                                               | Contract                                                             | Window (UTC)                        | Interval | Rows  |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------- | -------- | ----- |
| `blend_v2-CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD-hour-2026-09-08_2026-10-07.csv` | Blend v2 pool **Fixed** (`CAJJZSGM…BXBD`) — reserves XLM, USDC, EURC | 2026-09-08 00:00 → 2026-10-07 00:00 | HOUR     | 4,176 |

4,176 points = 696 hourly buckets × 6 products (supply + borrow for each of the 3 reserves):
every hour of the window, for every product.

## How it was produced

```sh
HUBBLE_MAX_BYTES_BILLED=644245094400 pnpm stellar:history -- \
  --protocol blend_v2 \
  --contract CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD \
  --from 2026-09-08 --to 2026-10-07 --interval HOUR
```

Run on 2026-10-07. Hubble returned 42,247 `contract_data` rows for the pool's 7 storage keys
(contract instance + `ResConfig`/`ResData` of each reserve); BigQuery billed 526.67 GiB, almost
all of it the seed scan (each key's last value before the window, back to Blend's launch).

The script goes through the registered `blend_v2` adapter — `getProducts` then
`getApyHistory` — so these are the points the backfill (`scripts/backfill-history.ts`) and the
nightly reconcile job would store for the same window.

## Columns

| Column          | Meaning                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `hour`          | Bucket start (UTC). The state is the one at the bucket's **end**, accrued to that instant.      |
| `product_id`    | LendWise product id (`blend:v2:stellar:pool:<pool>:<asset>:<supply\|borrow>`).                  |
| `kind`          | `supply` or `borrow`.                                                                           |
| `asset`         | Reserve asset symbol.                                                                           |
| `apy_base`      | Supply: gross yield before the backstop's cut. Borrow: the borrow APY.                          |
| `apy_fees`      | Supply: the backstop's cut (`apy_base − apy_net`). Borrow: 0.                                   |
| `apy_net`       | APY the user actually gets (supply) or pays (borrow). Daily compounding, as for every protocol. |
| `supply_assets` | Total supplied, in units of the asset.                                                          |
| `borrow_assets` | Total borrowed, in units of the asset (borrow rows).                                            |
| `utilization`   | Borrowed / supplied.                                                                            |

Rates are fractions (`0.0869` = 8.69 %).

## Verification

- The decoder's math is pinned by `blend/common/__tests__/apy-history.test.ts` against real
  mainnet storage of a v1 and a v2 pool: given the same storage and instant, it reproduces the
  Blend SDK's own `Reserve.load` rates and amounts.
- Cross-check of this file against a live SDK read of the same pool taken on 2026-10-07 at
  10:34 UTC (XLM reserve): utilization 0.0011179 in both; supplied 699,481,186 XLM at the last
  bucket (2026-10-06 23:00) vs 699,481,187 XLM live, the difference being 11 hours of accrual.

## Limits

- BLND emissions are not reconstructed: `apy_net` excludes rewards.
- No USD columns: Hubble has no historical oracle read. The backfill prices points from another
  provider's same-day observation where one exists.
- The pool has been On Ice since the exploit; that does not affect reconstruction — its storage
  is intact and still accrues.
