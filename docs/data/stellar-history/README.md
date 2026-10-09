# Stellar historical data — published output

Hourly market state of a Soroban lending contract, reconstructed from
[Stellar Hubble](https://developers.stellar.org/docs/data/analytics/hubble) (the public
BigQuery mirror of the Stellar ledger) by `src/lib/protocols/stellar/hubble-history.ts` and
the Blend decoder (`src/lib/protocols/blend/common/apy-history.ts`). See
[docs/architecture-stellar-integration.md](../../architecture-stellar-integration.md), part 2.

## Files

| File                                                                                                 | Contract                                                                    | Window (UTC)                        | Interval | Rows  |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------- | -------- | ----- |
| `blend_v2.1-CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO-hour-2026-09-09_2026-10-09.csv` | Blend v2.1 pool **Fixed v2.1** (`CBAKAZUE…IWAO`) — reserves XLM, USDC, EURC | 2026-09-30 14:00 → 2026-10-09 00:00 | HOUR     | 1,212 |
| `blend_v2-CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD-hour-2026-09-08_2026-10-07.csv`   | Blend v2 pool **Fixed** (`CAJJZSGM…BXBD`) — reserves XLM, USDC, EURC        | 2026-09-08 00:00 → 2026-10-07 00:00 | HOUR     | 4,176 |

Every hour of each window, for every product (supply + borrow for each of the 3 reserves):

- **v2.1** — 1,212 points = 202 hourly buckets × 6 products. The requested window started on
  2026-09-09; the pool's storage first appears in the 2026-09-30 14:00 bucket, which dates its
  deployment, so the series starts there. LendWise collects Blend from this deployment only.
- **v2** — 4,176 points = 696 hourly buckets × 6 products. Blend v2 is retired from collection
  (every pool frozen or on ice); this file stays as the first published reconstruction.

## How they were produced

```sh
HUBBLE_MAX_BYTES_BILLED=644245094400 pnpm stellar:history -- \
  --protocol blend_v2.1 \
  --contract CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO \
  --from 2026-09-09 --to 2026-10-09 --interval HOUR

HUBBLE_MAX_BYTES_BILLED=644245094400 pnpm stellar:history -- \
  --protocol blend_v2 \
  --contract CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD \
  --from 2026-09-08 --to 2026-10-07 --interval HOUR
```

| File | Run on     | Hubble `contract_data` rows (7 storage keys) | BigQuery billed |
| ---- | ---------- | -------------------------------------------- | --------------- |
| v2.1 | 2026-10-09 | 398                                          | 530.89 GiB      |
| v2   | 2026-10-07 | 42,247                                       | 526.67 GiB      |

The 7 storage keys are the pool's contract instance and the `ResConfig`/`ResData` of each
reserve. Almost all of the bytes are the seed scan (each key's last value before the window, back
to Blend's launch), which is why both runs cost the same whatever the window.

The script goes through the registered adapter — `getProducts` then `getApyHistory` — so these
are the points the backfill (`scripts/backfill-history.ts`) and the nightly reconcile job would
store for the same window. (The v2 file was produced while `blend_v2` was still registered.)

## Columns

| Column          | Meaning                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `hour`          | Bucket start (UTC). The state is the one at the bucket's **end**, accrued to that instant.      |
| `product_id`    | LendWise product id (`blend:<version>:stellar:pool:<pool>:<asset>:<supply\|borrow>`).           |
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
  mainnet storage of a v1, a v2 and a v2.1 pool: given the same storage and instant, it
  reproduces the Blend SDK's own `Reserve.load` rates and amounts.
- **v2.1** against a live SDK read of the same pool on 2026-10-09 at 15:42 UTC (USDC reserve):
  utilization 0.2626207 at the last bucket (2026-10-08 23:00) vs 0.2626323 live; supplied
  66,648.33 vs 66,649.12 USDC; borrowed 17,503.23 vs 17,504.21 USDC — 16 hours of accrual apart.
  The borrow rate is higher in the file (APR ≈ 3.36 % vs 3.01 % live), as it should be: below
  its 80 % target utilization, the reserve's rate modifier (`ir_mod`) decays continuously, and a
  rate reads the modifier stored at the reserve's last write.
- **v2** against a live SDK read on 2026-10-07 at 10:34 UTC (XLM reserve): utilization 0.0011179
  in both; supplied 699,481,186 XLM at the last bucket (2026-10-06 23:00) vs 699,481,187 XLM
  live, the difference being 11 hours of accrual.

## Limits

- BLND emissions are not reconstructed: `apy_net` excludes rewards.
- No USD columns: Hubble has no historical oracle read. The backfill prices points from another
  provider's same-day observation where one exists.
- The v2 pool has been On Ice since the exploit; that does not affect reconstruction — its
  storage is intact and still accrues.
