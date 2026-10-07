# LendWise — Stellar Cross-Chain Integration Architecture

> **Scope** — the Stellar integration validated in the Stellar Community Fund #45 submission,
> structured around five parts: Blend spot market data, Blend historical data via Stellar Hubble,
> Stellar wallet + SEP-10 auth + Blend positions + health factor + unified portfolio, CCTP
> execution from EVM into Blend, and optimizer ranking + monitoring.
>
> **Legend** — <span style="color:#16a34a">green = NEW bricks added for Stellar</span> ·
> blue = existing EVM pipeline (unchanged) · grey = shared core (unchanged) ·
> <span style="color:#7c3aed">purple = cross-chain execution (CCTP)</span>.

The integration spans five parts, matching the submission's tranche structure:

1. **Blend spot market data** — live rates and reserve parameters from Blend V1/V2.
2. **Blend historical data** — reserve-state reconstruction from Stellar Hubble.
3. **Wallet, auth & portfolio** — SEP-10, Blend position reads, health factor, unified portfolio.
4. **CCTP execution** — native USDC from an EVM chain into a Blend deposit.
5. **Optimizer & monitoring** — Blend ranked as a venue, nightly gap detection and healing.

---

## 1. Blend spot market data

```mermaid
flowchart TD
    %% ---------- Triggers ----------
    Cron["QStash cron<br/>every 10 min"] --> SpotRoute["POST /api/yield/apy/spot<br/>app/api/yield/apy/spot/route.ts"]
    SpotRoute --> Collect["collectApySpot()<br/>app/actions/apy-snapshots.actions.ts"]

    %% ---------- Registry ----------
    Collect --> Registry{{"YIELD_ADAPTERS<br/>src/config/protocols-server.ts<br/>lazy per-protocol dynamic import"}}

    %% ---------- EVM adapters (existing, GraphQL path) ----------
    subgraph EVM["EVM adapters — existing (GraphQL path)"]
        direction TB
        Aave["aave_v3<br/>aave/v3/apy-spot.ts"]
        Morpho["morpho_v1<br/>morpho/v1/apy-spot.ts"]
        Compound["compound_v3<br/>compound/v3/apy-spot.ts"]
        GqlClient["core/toolkit createGraphQLClient()<br/>(URQL)"]
        TheGraph[("The Graph subgraphs<br/>GraphQL")]
        Aave --> GqlClient
        Morpho --> GqlClient
        Compound --> GqlClient
        GqlClient --> TheGraph
    end

    %% ---------- Blend adapters (already implemented, non-GraphQL path, same uniform per-version layout as EVM) ----------
    subgraph STELLAR["Blend adapters — no subgraph, no GraphQL"]
        direction TB
        BlendV1["blend_v1<br/>blend/v1/apy-spot.ts<br/>fetchBlendV1ApySpot()"]
        BlendV2["blend_v2<br/>blend/v2/apy-spot.ts<br/>fetchBlendV2ApySpot()"]
        BlendSvc["blend/common/api.ts<br/>getBackstop · getPool · getPoolPrices"]
        BlendSDK["@blend-capital/blend-sdk<br/>+ @stellar/stellar-sdk"]
        SorobanRPC[("Soroban RPC<br/>paced ~300ms/call<br/>Backstop.load · PoolV1/V2.load")]
        BlendV1 --> BlendSvc
        BlendV2 --> BlendSvc
        BlendSvc --> BlendSDK --> SorobanRPC
    end

    Registry -->|"aave_v3"| Aave
    Registry -->|"morpho_v1"| Morpho
    Registry -->|"compound_v3"| Compound
    Registry -->|"blend_v1"| BlendV1
    Registry -->|"blend_v2"| BlendV2

    %% ---------- Per-reserve market data — each adapter returns SpotPayload[] already normalized ----------
    SorobanRPC --> BlendFields["Per reserve, live today:<br/>supply/borrow APY (aprToApyDaily)<br/>total supplied/borrowed liquidity · utilization<br/><br/>1.1a hardening adds:<br/>ir_mod · util · r_base · r_one · r_two · r_three · reactivity<br/>+ tests for no-oracle-pool and RPC-refusal paths"]
    TheGraph --> EvmFields["SpotPayload[]<br/>normalized inside each EVM adapter"]

    %% ---------- Persistence (shared, unchanged) ----------
    EvmFields --> Validate["spotPayloadSoftSchema<br/>soft-validate shape + finiteness"]
    BlendFields --> Validate
    Validate --> ApyRepo["upsertHourlySlots()<br/>repositories/apy.ts — running mean"]
    ApyRepo --> Hourly[("apy_hourly<br/>PK (product_id, hour)")]

    ReconcileCron["QStash cron<br/>nightly"] --> ReconcileRoute["POST /api/yield/apy/reconcile<br/>runReconcile() — 7-day sliding window"]
    ReconcileRoute --> Aggregate["aggregateDaily() + pruneHourly()<br/>+ gap/incomplete detection + donor/history healing"]
    Hourly --> Aggregate --> Daily[("apy_daily<br/>PK (product_id, date)")]
    ReconcileRoute --> Reports[("pipeline_reports<br/>insertReport('reconcile', …)")]

    %% ---------- Serving (shared, unchanged) ----------
    Hourly --> GraphQLServer["graphql-yoga /api/graphql"]
    Daily --> GraphQLServer
    GraphQLServer --> UI["URQL client<br/>Dashboard: EVM + Blend yields"]

    %% ---------- Styles ----------
    classDef core fill:#e5e7eb,stroke:#6b7280,color:#111827;
    classDef evm fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef stellar fill:#dcfce7,stroke:#16a34a,color:#111827,stroke-width:2px;

    class Cron,SpotRoute,Collect,Registry,Validate,ApyRepo,Hourly,ReconcileCron,ReconcileRoute,Aggregate,Daily,Reports,GraphQLServer,UI core;
    class Aave,Morpho,Compound,GqlClient,TheGraph,EvmFields evm;
    class BlendV1,BlendV2,BlendSvc,BlendSDK,SorobanRPC,BlendFields stellar;
```

**Reading the diagram** — matches the code as implemented, not a future design.

- The trigger, registry, `apy_hourly`/`apy_daily`, the nightly reconcile job, and the GraphQL
  serving layer are **shared and unchanged** — protocol-agnostic by design. `YIELD_ADAPTERS` in
  `src/config/protocols-server.ts` is the actual registry: a plain record of lazy dynamic imports
  keyed by protocol id (`aave_v3`, `morpho_v1`, `compound_v3`, `blend_v1`, `blend_v2`).
  `collectApySpot()` calls `getApySpot()` on every registered id via `Promise.allSettled`.
- Existing EVM protocols read through **The Graph subgraphs** via `createGraphQLClient()`.
- **Blend has no subgraph**, so `blend_v1`/`blend_v2` bypass GraphQL entirely, reading **Soroban
  contracts** through the **Blend SDK**. Both share `blend/common/api.ts`, which discovers the
  live pool set from `Backstop.load(...).config.rewardZone` rather than a hardcoded list, and
  serializes every RPC read behind a ~300ms pacing queue to stay under Soroban RPC's rate limit.
  This is the same uniform `<protocol>/<version>/apy-spot.ts` layout every EVM adapter already
  follows (`aave/v3/`, `morpho/v1/`, `compound/v3/`) — not a Blend-specific exception.
- **Already live:** supply/borrow APY, total supplied/borrowed liquidity, and utilization per
  reserve. **Not yet captured — this is 1.1a's hardening deliverable:** the interest rate modifier
  (`ir_mod`) and rate parameters (`util`, `r_base`, `r_one`, `r_two`, `r_three`, `reactivity`),
  plus test coverage for the no-oracle-pool and RPC-refusal failure paths already handled in code.
- Each adapter — EVM or Blend — returns `SpotPayload[]` **already normalized internally**; there is
  no separate shared normalization stage. `collectApySpot()` only soft-validates
  (`spotPayloadSoftSchema`) and upserts via `upsertHourlySlots()`.
- There is no separate daily cron: a single **nightly `/api/yield/apy/reconcile`** job
  (`runReconcile()`, 7-day sliding window) detects gaps/incomplete hours, heals them from donor
  products or via `adapter.getApyHistory()`, aggregates `apy_hourly` into `apy_daily`, prunes old
  hourly rows, and logs one row per run into `pipeline_reports`.

---

## 2. Blend historical data — Stellar Hubble reconstruction

```mermaid
flowchart TD
    BackfillScript["scripts/backfill-history.ts<br/>pnpm backfill:history -- --protocol blend --chains -1 --write<br/>PROTOCOL-BLIND — knows only adapter.getApyHistory"] --> Registry3{{"YIELD_ADAPTERS<br/>same registry as spot — no script changes"}}
    CLI["scripts/stellar-history.ts<br/>pnpm stellar:history -- --protocol blend_v2 --contract C…<br/>one contract → hourly CSV, no DB write"] --> Registry3
    Registry3 --> BlendHistory["blend_v1 / blend_v2 getApyHistory()<br/>blend/common/apy-history.ts — Blend decoder"]

    Hubble[("Stellar Hubble — BigQuery<br/>crypto_stellar.contract_data<br/>(+ history_contract_events, opt-in)")] --> Module
    BlendHistory --> Module["stellar/hubble-history.ts — generic module<br/>fetch the decoder's storage keys (ledger_key_hash)<br/>replay writes → one storage snapshot per HOUR/DAY bucket"]
    Module -->|"snapshot per bucket"| Decode["Blend decoder hook<br/>ResConfig + ResData + pool Config<br/>→ SDK Reserve.accrue() at bucket end<br/>supply/borrow APY · supplied · borrowed · utilization"]

    Decode --> Enrich["enrichPointsWithUsd()<br/>backfill/enrich-usd.ts — prices points missing USD<br/>from another provider's same-day observation"]
    Enrich --> Insert["backfillDailyRows()<br/>INSERT add-only, ON CONFLICT DO NOTHING"]
    Enrich --> Patch["patchDailyMarketState()<br/>PATCH fill-only, COALESCE(existing, incoming)"]
    Insert --> Daily2[("apy_daily")]
    Patch --> Daily2

    Reconcile2["Nightly /api/yield/apy/reconcile<br/>(part 1)"] -.->|"same getApyHistory, HOUR,<br/>used for gap healing"| BlendHistory

    classDef core fill:#e5e7eb,stroke:#6b7280,color:#111827;
    classDef stellar fill:#dcfce7,stroke:#16a34a,color:#111827,stroke-width:2px;

    class BackfillScript,Registry3,Enrich,Insert,Patch,Daily2,Reconcile2 core;
    class BlendHistory,Hubble,Module,Decode,CLI stellar;
```

**Reading the diagram**

- Blend has **no subgraph and no history API** of its own, so history is **reconstructed from
  Stellar Hubble**, the public BigQuery mirror of the ledger.
- **Two halves.** `src/lib/protocols/stellar/hubble-history.ts` is protocol-blind: it queries
  `contract_data` for exactly the storage keys a decoder names (matched on `ledger_key_hash` =
  sha256 of the `LedgerKey` XDR, the formula stellar-etl uses), seeds each key with its last value
  before the window, replays every later write, and hands the decoder one storage snapshot per
  complete HOUR or DAY bucket. A Stellar adapter supplies only the decoder
  (`StellarHistoryDecoder`: `contractId`, `ledgerKeys`, `decode`) and gets `getApyHistory` from it.
- **Blend's decoder recomputes rates the way the SDK does.** Rates are not stored on-chain; the
  pool stores their inputs. The decoder parses `ResConfig(asset)`, `ResData(asset)` and the pool
  `Config` (backstop take rate) with the SDK's own parsers, accrues the reserve to the bucket's end
  with `Reserve.accrue()`, and applies the same APR→APY split as `apy-spot.ts` — so a backfilled
  hour and a collected hour are computed identically. A test pins this against real mainnet
  storage for a v1 and a v2 pool (`blend/common/__tests__/fixtures/`).
- **Pools On Ice / Frozen still reconstruct.** Their storage is intact and still accrues; status
  only blocks new actions.
- **Not reconstructed:** BLND emissions (`rewards` = 0) and USD amounts (filled downstream by
  `enrichPointsWithUsd`, or left NULL).
- **Cost guard.** The seed scan reaches back to Blend's launch (2024-05), and `contract_data` is
  clustered on `last_modified_ledger` first, so the `contract_id` filter prunes little. Every job
  carries `maximumBytesBilled` (`HUBBLE_MAX_BYTES_BILLED`, default 20 GiB); over it, BigQuery
  refuses and the products are reported as failures — the reconcile job then heals from donors.
  `pnpm stellar:history -- … --dry-run` prices a window without running it.
- **Callers.** The backfill harness and the nightly reconcile job call `getApyHistory()` unchanged —
  Stellar's internal chain id is `-1`, so the backfill needs `--chains -1`. The pool, asset and
  storage version come from the meta Blend writes at `getProducts` time (`poolId`, `assetId`,
  `version`), never from parsing the productId.

---

## 3. Wallet, SEP-10 auth, Blend positions, health factor & unified portfolio

```mermaid
flowchart TD
    subgraph Auth["Wallet connection + SEP-10 authentication"]
        direction TB
        Wallets["Freighter / xBull / Lobstr / Albedo"] --> StellarKit["StellarWalletContext.tsx<br/>StellarWalletsKit.authModal()"]
        StellarKit --> Challenge["POST /api/auth/stellar/challenge<br/>server-signed tx: seq 0, ManageData nonce,<br/>web_auth_domain, 5-min time bounds"]
        Challenge --> Sign["Wallet signs challenge<br/>StellarWalletsKit.signTransaction — never submitted"]
        Sign --> Verify["POST /api/auth/stellar/verify<br/>signatures vs account signers/threshold,<br/>nonce consumed once (Redis GETDEL)"]
        Verify --> Session["httpOnly session cookie (7 days)<br/>GET /api/auth/stellar/session after refresh"]
    end

    StellarKit --> Store["Zustand walletStore<br/>chainFamily: 'evm' | 'stellar' | 'bitcoin'"]
    Session -->|"stellarSession on the wallet;<br/>revalidated on every load"| Store

    subgraph MarketData["Market data — from part 1 (unchanged)"]
        direction TB
        BlendMarket[("Blend market data<br/>apy_hourly / apy_daily")]
    end

    subgraph Positions["Blend positions — NEW, separate pipeline from market data"]
        direction TB
        PoolUser["PoolUser.load<br/>Blend V1 + V2 pools"]
        Convert["bToken / dToken → underlying conversion<br/>reuses part 1's exchange-rate math"]
        Health["Health factor calculation<br/>Σ(collateral·price·c_factor) / Σ(liability·price ÷ l_factor)<br/>unpriced reserve → 'unknown', never zero"]
        PoolUser --> Convert --> Health
    end

    Store -->|"G… public key"| PoolUser
    BlendMarket -->|"oracle price map<br/>(reused, no second oracle call)"| Health

    subgraph Merge["Portfolio merge — NEW"]
        direction TB
        EvmPositions["Existing EVM position fetch<br/>Aave / Morpho / Compound"]
        Allsettled["Promise.allSettled merge"]
        Degrade["Partial-data indicator<br/>if Stellar side rejects"]
        EvmPositions --> Allsettled
        Health --> Allsettled
        Allsettled --> Degrade
    end

    Degrade --> Portfolio["Unified portfolio UI<br/>EVM + Blend positions + health factor"]

    classDef core fill:#e5e7eb,stroke:#6b7280,color:#111827;
    classDef evm fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef stellar fill:#dcfce7,stroke:#16a34a,color:#111827,stroke-width:2px;

    class Store,Portfolio core;
    class EvmPositions evm;
    class Wallets,StellarKit,Challenge,Sign,Verify,Session,PoolUser,Convert,Health,BlendMarket,Allsettled,Degrade stellar;
```

**Reading the diagram**

- **Auth (top) — SEP-10 on top of the wallet connection.** `StellarWalletContext.tsx` connects
  **Freighter, xBull, Lobstr and Albedo** via `StellarWalletsKit.authModal()`, then runs the
  **SEP-10** round trip (`src/lib/auth/stellar-sep10.ts`): the server issues a challenge signed by
  `STELLAR_SEP10_SIGNING_SECRET`, the client checks it is a genuine challenge for this address and
  network before asking the wallet to sign it, and the server verifies the signatures against the
  account's signers and medium threshold (any extra signature is rejected) before setting an
  httpOnly session cookie. Challenges are single-use and sessions revocable through Upstash Redis,
  which is therefore required in production. After a refresh, a persisted Stellar wallet counts as
  connected only if `/api/auth/stellar/session` still validates its cookie.
- **Network passphrase.** Server (`STELLAR_NETWORK_PASSPHRASE`) and wallet
  (`NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`) both default to mainnet and must agree — a challenge
  signed for one passphrase cannot verify under the other; the client refuses a mismatched
  challenge before signing, and a session cookie from another network is not a session.
- **Market data vs. positions are two distinct pipelines.** Market data (part 1/2) describes what
  a Blend pool as a whole offers; positions describe what one authenticated wallet holds in it.
  Blend positions are **never** written into `apy_hourly`/`apy_daily` or the nightly cron —
  `PoolUser.load` is a per-user, on-demand read, resolved to a single direct ledger-entry read.
- **Conversion reuses part 1's math.** Blend's bToken/dToken share units convert to underlying
  amounts with the same exchange-rate logic already built for reserve totals in the spot adapter —
  this is a new caller of that logic, not new conversion logic.
- **Health factor reuses the oracle price map** already fetched per-pool in the spot pipeline, so
  computing it costs no second round of oracle calls. An unpriced reserve fails the calculation
  **closed** — shown as "unknown" in the UI — rather than valuing that collateral at zero.
- **Merge is `Promise.allSettled`, not custom logic.** A rejected Stellar-side promise renders the
  EVM side with a partial-data indicator instead of blanking the dashboard — this is
  `allSettled`'s native behavior.

---

## 4. CCTP execution — EVM → Stellar → Blend

```mermaid
flowchart TD
    Opportunity["Blend opportunity identified by LendWise<br/>(optimizer ranking or manual selection)"] --> TrustlineCheck{"Recipient Stellar wallet<br/>has USDC trustline?"}

    TrustlineCheck -->|"missing"| ChangeTrust["User signs ChangeTrust operation<br/>locks 0.5 XLM base reserve"]
    ChangeTrust --> Ready["Stellar wallet ready"]
    TrustlineCheck -->|"present"| Ready

    Ready --> Burn["CCTP V2 USDC burn<br/>source EVM chain contracts"]
    Burn --> Iris["Circle Iris API<br/>attestation polling — Fast Transfer tier"]
    Iris --> StellarMint["Stellar CCTP Soroban contracts<br/>message-transmitter → token-messenger-minter → cctp-forwarder"]
    StellarMint --> NativeUSDC["Native USDC available on Stellar<br/>7-decimal rescale from 6-decimal EVM amount"]
    NativeUSDC --> BlendSupply["LendWise supplies USDC into Blend<br/>guided, single user action"]
    BlendSupply --> PortfolioUpdate["Blend position appears in<br/>unified portfolio (part 3)"]

    classDef core fill:#e5e7eb,stroke:#6b7280,color:#111827;
    classDef bridge fill:#ede9fe,stroke:#7c3aed,color:#111827,stroke-width:2px;

    class Opportunity,PortfolioUpdate core;
    class TrustlineCheck,ChangeTrust,Ready,Burn,Iris,StellarMint,NativeUSDC,BlendSupply bridge;
```

**Reading the diagram**

- **Order is load-bearing: trustline check before burn, not after.** Stellar requires an explicit
  trustline before an account can hold any non-native asset, including SEP-41-wrapped USDC — a
  mint to an account without one fails at the ledger level, and that failure only surfaces after
  the source-chain burn has already been attested. The check has to gate the burn, not just the
  mint.
- **The forwarder step is not optional.** Stellar's account model can't receive an arbitrary
  contract's mint the way an EVM address receives an ERC-20 `mint(to, amount)` call, so
  `mintRecipient` is routed to the `cctp-forwarder` contract (with `destinationCaller` also set to
  it) — routing it to the end-user's address directly makes the funds permanently unrecoverable,
  per Circle's own documentation.
- **Fast Transfer is the default finality tier**, since Stellar's own ~5-second finality means the
  attestation wait dominates total transfer time regardless of tier choice.
- **This is not an isolated bridge integration.** The chain is presented as one guided product
  flow — burn → attestation → mint → Blend deposit — triggered from a ranked Blend opportunity
  (part 5), with a transaction hash logged at every step for auditability. This chain is what
  materializes LendWise's cross-chain execution layer for Stellar.

---

## 5. Optimizer & monitoring

```mermaid
flowchart TD
    subgraph Rank["Optimizer ranking"]
        direction TB
        BlendData[("Standardized Blend market data<br/>apy_hourly / apy_daily")] --> Optimizer["Existing LendWise optimizer<br/>ranking engine, unchanged"]
        Optimizer --> Ranked["Blend ranked alongside<br/>Aave / Morpho / Compound"]
        Ranked -->|"Blend selected"| GuidedFlow["Deep link into guided<br/>CCTP-to-Blend flow (part 4)"]
    end

    subgraph Monitor["Nightly reconcile & gap healing"]
        direction TB
        NightlyCron["Existing /api/yield/apy/reconcile<br/>runReconcile(), 7-day sliding window"] --> GapDetect["findGaps / findIncomplete<br/>detect missing/incomplete Blend hours"]
        GapDetect --> Heal["Heal from donor products, or via<br/>adapter.getApyHistory() once Blend has one"]
        Heal --> Reports[("pipeline_reports<br/>insertReport('reconcile', …) — Blend alongside EVM protocols")]
    end

    classDef core fill:#e5e7eb,stroke:#6b7280,color:#111827;
    classDef stellar fill:#dcfce7,stroke:#16a34a,color:#111827,stroke-width:2px;

    class Optimizer,Ranked,NightlyCron,GapDetect,Heal,Reports core;
    class BlendData,GuidedFlow stellar;
```

**Reading the diagram**

- **Optimizer:** reuses the existing ranking engine as-is — Blend's rates already flow into the
  same `apy_hourly`/`apy_daily` tables every other protocol uses, so surfacing Blend is a UI and
  deep-linking task, not a new ranking engine. Selecting a ranked Blend entry deep-links directly
  into the guided CCTP-to-Blend flow (part 4), tying market intelligence → optimization →
  execution together.
- **Monitoring:** `runReconcile()` behind `/api/yield/apy/reconcile` already runs generically
  across every registered adapter in `YIELD_ADAPTERS`, over a 7-day sliding window
  (`RECONCILE_WINDOW_DAYS`). Registering Blend into that existing gap-detection/healing cycle — no
  new monitoring infrastructure — means every night LendWise checks for holes in the Blend record
  and heals them once `blend_v1`/`blend_v2` implement `getApyHistory()` (part 2), with one row per
  run logged into the same `pipeline_reports` table every other protocol uses.

---

## 6. End-to-end cross-chain user journey

```mermaid
flowchart LR
    A["Connect Stellar wallet<br/>Freighter / xBull / Lobstr / Albedo<br/>+ SEP-10 auth (NEW)"] --> B["Unified dashboard<br/>EVM + Blend market data<br/>(spot + 90+ days historical)"]
    B --> C["Optimizer<br/>Blend ranked alongside Aave / Morpho / Compound"]
    C --> D{"Blend selected?"}
    D -->|"yes"| E["Guided CCTP-to-Blend flow<br/>trustline check → burn → attestation → mint → deposit"]
    D -->|"no"| F["EVM venue<br/>existing flow, unchanged"]
    E --> G["Blend position reflected in<br/>unified portfolio + health factor"]
    F --> G
    G --> B

    classDef core fill:#e5e7eb,stroke:#6b7280,color:#111827;
    class A,B,C,D,E,F,G core;
```

This is the guided flow the submission promises: **connect → compare → optimize → execute**, with
Blend as a first-class venue ranked next to EVM markets and reachable directly from an EVM wallet
via CCTP — with no DEX swap, third-party bridge, or fiat on-ramp step in the path.

---

## 7. New vs existing — at a glance

| Brick                                  | Status         | Library / path                                                                                     |
| :------------------------------------- | :------------- | :------------------------------------------------------------------------------------------------- |
| Adapter registry                       | existing       | `YIELD_ADAPTERS` — `src/config/protocols-server.ts`                                                |
| Spot collection                        | existing       | `collectApySpot()` — `app/actions/apy-snapshots.actions.ts`                                        |
| EVM lending data                       | existing       | The Graph subgraphs via `createGraphQLClient()` (URQL)                                             |
| `apy_hourly` / `apy_daily`             | existing       | `repositories/apy.ts` + Drizzle schema                                                             |
| Nightly reconcile (aggregate/heal)     | existing       | `/api/yield/apy/reconcile` — `runReconcile()`, 7-day sliding window                                |
| GraphQL serving                        | existing       | `graphql-yoga` `/api/graphql`                                                                      |
| Existing EVM position fetch            | existing       | portfolio data-fetch layer                                                                         |
| Existing optimizer ranking engine      | existing       | optimizer module, unchanged                                                                        |
| Blend V1 spot adapter                  | **shipped**    | `src/lib/protocols/blend/v1/apy-spot.ts`                                                           |
| Blend V2 spot adapter                  | **shipped**    | `src/lib/protocols/blend/v2/apy-spot.ts`                                                           |
| Blend data source                      | **shipped**    | `@blend-capital/blend-sdk` + `@stellar/stellar-sdk` over Soroban RPC                               |
| Stellar wallet connection              | **shipped**    | `StellarWalletContext.tsx` — Freighter / xBull / Lobstr / Albedo                                   |
| `chainFamily` store field              | **shipped**    | `src/stores/walletStore.ts`                                                                        |
| **Blend rate-parameter fields**        | **NEW (1.1a)** | `ir_mod` / `util` / `r_base` / `r_one` / `r_two` / `r_three` / `reactivity` + failure-path tests   |
| Blend historical adapter               | **shipped**    | `blend/common/apy-history.ts` (decoder) — `getApyHistory()` on `blend_v1` / `blend_v2`             |
| Stellar Hubble reconstruction          | **shipped**    | `stellar/hubble-history.ts`; consumed by `backfill-history.ts`, reconcile, `stellar-history.ts`    |
| SEP-10 authentication                  | **shipped**    | `/api/auth/stellar/{challenge,verify,session}` + `lib/auth/stellar-sep10.ts` + client signing flow |
| **Blend position reads**               | **NEW (2.1a)** | `PoolUser.load` + bToken/dToken conversion                                                         |
| **Health factor calculation**          | **NEW (2.1b)** | per-reserve collateral/liability factors, reused oracle price map                                  |
| **Portfolio merge**                    | **NEW (2.2b)** | `Promise.allSettled` + partial-data indicator                                                      |
| **CCTP trustline check & ChangeTrust** | **NEW (3.1b)** | `src/lib/execution/cctp/trustline.ts`                                                              |
| **CCTP burn (EVM) + forwarder mint**   | **NEW (3.1a)** | `src/lib/execution/cctp/` — Circle CCTP V2 + Stellar Soroban contracts                             |
| **CCTP attestation → Blend deposit**   | **NEW (3.1c)** | Circle Iris polling client + chained Blend Supply call                                             |
| **Optimizer ranking surfacing**        | **NEW (3.2a)** | Blend added as ranked venue + deep link into CCTP flow                                             |
| **Monitoring / gap-heal extension**    | **NEW (3.2b)** | Blend registered into existing reconcile + `pipeline_reports`                                      |
