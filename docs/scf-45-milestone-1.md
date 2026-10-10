# SCF #45 — Milestone 1 (Tranche 1, MVP)

Evidence for the two Tranche 1 deliverables of LendWise's
[Stellar Community Fund #45 submission](https://communityfund.stellar.org/submissions/recmK8tdxCKvSU3GS):
each success criterion, and where to check it — in this public repository and live on
[lendwise.fi](https://lendwise.fi).

| Deliverable                                                                               | Success criterion                                                                                                                                                                                  | Status    |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [1 — Stellar historical data](#1--stellar-historical-data)                                | Module in the public repository, tests passing in CI, registered in the generic backfill script; hourly state series for a given Soroban contract from Hubble, output published alongside the code | Delivered |
| [2 — Stellar wallet connection & SEP-10 auth](#2--stellar-wallet-connection--sep-10-auth) | On lendwise.fi: connect any supported wallet, sign, stay connected after a refresh, session verified server-side                                                                                   | Delivered |

Blend is collected from its **v2.1** deployment: every Blend v1 and v2 pool has been frozen or on
ice since the exploit, and v2.1 runs the same pool contract behind a new backstop. The evidence
below uses the v2.1 **Fixed v2.1** pool,
[`CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO`](https://mainnet.blend.capital/dashboard/?poolId=CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO).

---

## 1 — Stellar historical data

> **Success criteria:** The module ships in the public repository with its tests passing in CI
> and is registered in the generic backfill script; for a given Soroban contract address, it
> reconstructs an hourly state series over the recorded time horizon from Hubble, with the output
> published alongside the code.

### What was built

| Proposal item                                                                                                                                                                                      | Where                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Historical-state reconstruction module** querying Stellar Hubble for a contract's ledger entries and events, bucketed hourly, producing the standardized market data format of the spot pipeline | [`src/lib/protocols/stellar/hubble-history.ts`](../src/lib/protocols/stellar/hubble-history.ts) — `fetchStellarHubbleHistory`                                                                                                                |
| **Decode hook** — each Stellar adapter supplies only its contract-specific decoding and gets `getApyHistory`                                                                                       | `StellarHistoryDecoder` in the same file; Blend's decoder: [`src/lib/protocols/blend/common/apy-history.ts`](../src/lib/protocols/blend/common/apy-history.ts) — `blendHistoryDecoder`                                                       |
| **Registration** in the generic backfill script, with no change to the script                                                                                                                      | `getApyHistory` on the `blend_v2.1` adapter ([`src/lib/protocols/blend/v2_1/index.ts`](../src/lib/protocols/blend/v2_1/index.ts)) — the interface Aave, Compound and Morpho implement ([`YieldAdapter`](../src/lib/protocols/core/types.ts)) |

**How the module works.** It reads Hubble's `crypto_stellar.contract_data` — the ledger-entry
history — for exactly the storage keys the decoder names: rows are matched on `ledger_key_hash`,
which [stellar-etl](https://github.com/stellar/stellar-etl) fills with the sha256 of the entry's
`LedgerKey` XDR, so the decoder computes the same hash for the keys it needs. Each key is seeded
with its last value before the window, every later write is replayed, and the decoder receives one
snapshot of the contract's storage per complete hour (or day). `history_contract_events` is
supported through the same hook (`events: true`) for protocols whose state needs them; Blend's
does not — its reserve state is fully in storage. Each job is capped by `maximumBytesBilled`, and
`HUBBLE_DRY_RUN=1` prices a reconstruction before running it.

**Blend's decoder.** Blend stores the inputs of its rates, not the rates. The decoder parses
`ResConfig(asset)`, `ResData(asset)` and the pool's `Config` with the Blend SDK's own parsers,
accrues the reserve to the end of the hour with `Reserve.accrue()`, and applies the same APR→APY
conversion as the spot pipeline — so a reconstructed hour and a collected hour are computed the
same way. Output fields: supply APY, borrow APY, total supplied, total borrowed, utilization.

**The backfill script is unchanged.** [`scripts/backfill-history.ts`](../scripts/backfill-history.ts)
was last modified on 2026-08-05, before this work (`git log -- scripts/backfill-history.ts`). It
is protocol-blind and calls `adapter.getApyHistory()`; registering the adapter is all Blend
needed. Stellar's internal chain id is `-1`:

```sh
pnpm backfill:history -- --protocol blend_v2.1 --chains -1 --days 11 --write
```

### Tests (CI)

The [CI workflow](../.github/workflows/ci.yml) runs format, lint, codegen, tests and typecheck on
every push to `main` — see the [runs](https://github.com/lendwise-fi/lendwise/actions/workflows/ci.yml?query=branch%3Amain).

| Test file                                                                                                       | Tests | What it pins                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`stellar/hubble-history.test.ts`](../src/lib/protocols/stellar/hubble-history.test.ts)                         | 12    | Hour/day bucketing (only complete buckets), carry-forward of unchanged keys, deleted keys, the `ledger_key_hash` formula against a real key, query parameters and byte cap, per-product failures, dry run            |
| [`blend/common/__tests__/apy-history.test.ts`](../src/lib/protocols/blend/common/__tests__/apy-history.test.ts) | 16    | The decoder against **real mainnet storage** of a Blend v1, v2 and v2.1 pool ([fixtures](../src/lib/protocols/blend/common/__tests__/fixtures/)): same storage, same instant → the Blend SDK's own rates and amounts |
| [`blend/__tests__/listing.test.ts`](../src/lib/protocols/blend/__tests__/listing.test.ts)                       | 11    | Pool discovery: catalogue ∪ backstop reward zone ∪ factory `Deploy` events                                                                                                                                           |
| [`blend/common/__tests__/hubble.test.ts`](../src/lib/protocols/blend/common/__tests__/hubble.test.ts)           | 7     | Pool discovery from Hubble's factory events                                                                                                                                                                          |

### Published output — hourly series for a given contract

[`docs/data/stellar-history/`](data/stellar-history/) — produced by
[`scripts/stellar-history.ts`](../scripts/stellar-history.ts), which takes a contract address and
goes through the registered adapter (`getProducts` then `getApyHistory`), so its points are the
ones the backfill stores:

| File                                                                                                                                                                             | Contract                   | Window                                                                           | Points                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- | ------------------------- |
| [`blend_v2.1-CBAKAZUE…-hour-2026-09-09_2026-10-09.csv`](data/stellar-history/blend_v2.1-CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO-hour-2026-09-09_2026-10-09.csv) | Blend v2.1 Fixed v2.1 pool | its whole recorded horizon: from deployment (2026-09-30 14:00 UTC) to 2026-10-09 | 1,212 = 202 h × 6 markets |
| [`blend_v2-CAJJZSGM…-hour-2026-09-08_2026-10-07.csv`](data/stellar-history/blend_v2-CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD-hour-2026-09-08_2026-10-07.csv)     | Blend v2 Fixed pool        | 2026-09-08 → 2026-10-07                                                          | 4,176 = 696 h × 6 markets |

Their [README](data/stellar-history/README.md) records the commands, the Hubble rows and bytes
billed, the column meanings, and a cross-check of each file against a live SDK read of the same
pool.

The module also runs in production: it backfilled LendWise's daily history for the v2.1 markets
since the pool's deployment, and for every Blend market over a month-long collection outage in
September 2026.

### Reproduce

Needs `GCP_PROJECT` and `GCP_SERVICE_ACCOUNT_BASE64` (a service account allowed to run BigQuery
jobs) in `.env`. The dry run is free; a real run scans ~530 GiB of `contract_data` (≈ $3),
whatever the window, for the seed state.

```sh
pnpm install
pnpm stellar:history -- --protocol blend_v2.1 \
  --contract CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO --days 30 --dry-run
HUBBLE_MAX_BYTES_BILLED=644245094400 pnpm stellar:history -- --protocol blend_v2.1 \
  --contract CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO --days 30
```

---

## 2 — Stellar wallet connection & SEP-10 auth

> **Success criteria:** On lendwise.fi, a reviewer clicks "Connect Stellar Wallet," picks any
> supported wallet, signs the authentication prompt, and their address stays connected after
> refreshing the page, with the session verified server-side against the signed challenge.

### What was built

| Proposal item                                                                     | Where                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEP-10 challenge-issuing endpoint**                                             | [`/api/auth/stellar/challenge`](../src/app/api/auth/stellar/challenge/route.ts) (GET `?account=` and POST), with [`verify`](../src/app/api/auth/stellar/verify/route.ts) and [`session`](../src/app/api/auth/stellar/session/route.ts); logic in [`src/lib/auth/stellar-sep10.ts`](../src/lib/auth/stellar-sep10.ts) |
| **Client-side challenge signing** in the existing `StellarWalletContext`          | [`src/contexts/StellarWalletContext.tsx`](../src/contexts/StellarWalletContext.tsx)                                                                                                                                                                                                                                  |
| **Session persistence** in the unified wallet store's `chainFamily` discriminator | [`src/stores/walletStore.ts`](../src/stores/walletStore.ts) — the `stellar` wallet carries its `stellarSession`, persisted like EVM wallets                                                                                                                                                                          |
| **All four wallets** — Freighter, xBull, Lobstr, Albedo                           | the Stellar Wallets Kit modules registered in `StellarWalletContext`                                                                                                                                                                                                                                                 |

**The challenge** is a transaction with sequence number 0, a `ManageData` operation
`<domain> auth` carrying a 48-byte random nonce, a `web_auth_domain` operation, a 5-minute
validity window, and the server's signature (`STELLAR_SEP10_SIGNING_SECRET`).

**Before signing,** the client checks that it is a genuine challenge: the server's signature, its
own address as the operation source, the mainnet passphrase, the page's own host as the domain,
and only `ManageData` operations. The wallet then signs it through the kit's `signTransaction`. It
is never submitted to the network.

**The server verifies** the signatures against the account's signers and medium threshold (an
unfunded account must carry exactly its own signature), and rejects any extra signature. Each
challenge can be used once (atomic `GETDEL` in Upstash Redis). It then sets an httpOnly session
cookie valid 7 days. After a refresh, a persisted Stellar wallet counts as connected only if
`GET /api/auth/stellar/session` still validates that cookie; `DELETE` revokes it server-side.

**Network passphrase.** The server and the wallet both use the SDK's `Networks.PUBLIC` constant —
there is no setting that could make them disagree, which is the failure the proposal warns about.
A challenge for another passphrase is refused by the client before signing, a signature made for
another network does not verify, and a session issued on another network is not accepted.

### Tests (CI)

| Test file                                                                                                                                                                                                        | Tests | What it pins                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`stellar-sep10.test.ts`](../src/lib/auth/stellar-sep10.test.ts)                                                                                                                                                 | 15    | Challenge shape (sequence 0, server-signed `ManageData`, mainnet); single use; rejects a signature for another passphrase, an expired challenge, another address, a foreign server key, an unmet multisig threshold, an extra signature, a forged host; session from another network |
| [`challenge-store-redis.test.ts`](../src/lib/auth/challenge-store-redis.test.ts), [`session-store.test.ts`](../src/lib/auth/session-store.test.ts), [`session-key.test.ts`](../src/lib/auth/session-key.test.ts) | 10    | Atomic nonce consumption, session revocation, session-key derivation                                                                                                                                                                                                                 |

### Reviewer walkthrough on lendwise.fi

1. Open [lendwise.fi](https://lendwise.fi) → **Connect Wallet** → **Stellar Wallet** (the
   "Connect Stellar Wallet" of the criterion).
2. Pick **Freighter**, **xBull**, **Lobstr** or **Albedo**, and approve the connection.
3. The wallet asks to sign a transaction with a `ManageData` operation named `lendwise.fi auth`:
   this is the SEP-10 challenge. Sign it — nothing is submitted, no fee is charged.
4. The address is connected. **Refresh the page**: it is still connected.
5. Server-side check: in the browser's developer tools, `GET /api/auth/stellar/session` answers
   **200** with the session for that address; without the session cookie it answers **401**.

The challenge endpoint can also be read directly:

```sh
curl "https://lendwise.fi/api/auth/stellar/challenge?account=<your G… address>"
# → networkPassphrase "Public Global Stellar Network ; September 2015",
#   homeDomain / webAuthDomain "lendwise.fi", transactionXdr, serverSigningKey
```

---

## Related

- [Architecture of the Stellar integration](architecture-stellar-integration.md)
- Public documentation: [Data & methodology](https://lendwise.fi/docs/guide/methodology) (Stellar
  history), [Getting started](https://lendwise.fi/docs/guide/getting-started) (Stellar wallet
  sign-in), [GraphQL API](https://lendwise.fi/docs/api/graphql) (Blend markets, chain id `-1`)
