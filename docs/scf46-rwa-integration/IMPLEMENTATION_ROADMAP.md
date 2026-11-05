# Implementation roadmap and acceptance criteria

Recommended funded work: Etherfuse USTRY/CETES discovery, correct metrics/price history, comparison, essential GraphQL, existing-wallet/CCTP reuse and an approved issuer handoff with measurable settlement. Portfolio, SDK and Turbolong may be added only after their gates pass and effort fits the agreed request. Broad issuers, embedded/fiat onboarding and autonomous execution are excluded.

All estimates are engineering person-days (8 hours), not cost quotes. Core totals **34–50 person-days**, approximately 10–14 calendar weeks with a primary engineer plus part-time frontend/QA/security review, excluding partner waiting and user adoption. These ranges cover financial data, quality, UI, tests and evidence beyond a simple provider API hookup. Provider-specific baseline integration estimates should be checked against SCF's linked partner guidance before requesting funds. No grant total or on-chain activity target is specified here.

## Pre-submission gates — not a funded planning tranche

The [official deliverable guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines) requires architecture before application and development in tranche 1. Complete these gates before calling the submission ready:

| Gate                          | Owner                                | Required evidence / exit condition                                                                                                                                                          |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 economics and data rights  | Product lead + Etherfuse             | Written rate compounding/day-count/fee semantics or explicit agreed indicative-only scope; production data display/history retention/redistribution permission                              |
| P1 identity and product terms | Integration engineer + issuer        | Approved Stellar USTRY/CETES identifiers/network, current control flags, price meaning, maturity/redemption/eligibility sources; migration/payload fixtures frozen                          |
| P2 end-user integration       | Product/integration lead + Etherfuse | Approved handoff or partner interface, supported countries and user consent model; sandbox/low-value mainnet verification plan and settlement attribution accepted                          |
| P3 grant outcome              | Grant lead + SCF                     | Metric type, numeric threshold, window and registered footprint agreed with panel; existing traction documented; data-only interpretation explicitly rejected or accepted by SCF in writing |
| P4 operating readiness        | Maintainers                          | Named DB/collector/monitoring owners, migration privileges, deployment access, source quota, supported rollback; review this document package                                               |

Planning/spike allowance for those gates: 2–4 person-days of team effort plus external response time, performed before funded development and not represented as a completed agreement. If P2/P3 cannot close, retain a valid analytics architecture but revise grant scope/track rather than inventing user activity.

## Tranche 1 — Working Etherfuse data MVP

**Objective:** users can inspect two verified Stellar products with correct financial labels, source times and initial price history.

**Included:** new RWA tables/repositories, approved Etherfuse public read adapter, unit/convention normalization, prospective history, public RWA GraphQL, minimal comparison UI. **Excluded:** broad issuers, embedded/fiat onboarding, historical archive promises, private customer data, trading and auto-optimization.

**Tasks:** add additive migrations and indexes; implement canonical runtime types/identity map; source-native collector with idempotent revisions and signed QStash entry; persist source evidence; add queries and UI; reuse lending layout/filter conventions without routing RWA rows through APY sorter; create financially independent fixtures.

**Dependencies:** P0/P1/P4, Neon staging branch, job signing/hosting access and available public sources. **Effort:** 14–20 days. **Deliverables:** application change set, schema/migration plan, adapter conformance report, source fixtures, GraphQL schema/operations, test evidence and demo.

**Acceptance:** USTRY and CETES identifiers match approved Stellar mapping; 100% accepted observations preserve source/metric/currency/times/method; unknown effective yield stays null; no hourly yield fabrication; same inputs replay without duplicates; public queries produce partial errors correctly; prior lending query/portfolio contracts remain unchanged. No maturity/yield-history claim without source proof.

**Automated tests:** unit/decimal/FX checks, API schema fixtures, duplicate/revision/failed-page cases, source timeout isolation, migration up/disable-read rollback rehearsal and lending SDL regression. **Demonstration:** walk reviewer from product discovery to labeled rate/price provenance, valid comparison and unavailable-history state with testable queries.

**Security:** approved hosts/assets, no provider secrets in browser, immutable source evidence, signed jobs, bounded GraphQL and feature flag. **Risks/mitigation:** source schema drift → version pin and quarantine; unknown fee convention → indicative-only category. **Verification evidence:** CI artifacts, query output with timestamps, migration dry-run and fixture checksums. **Mainnet readiness:** observation-only mainnet reads can be enabled after validation; no transaction activity generated by these reads.

## Tranche 2 — Hardened journey and equivalent test environment

**Objective:** validate the complete eligible-user journey and reliable operations under failure, before mainnet rollout.

**Included:** approved issuer handoff, settlement observer/attribution, RWA public balance/valuation if product mapping passes, source quality dashboard/alerts, 14-day observation soak, CCTP regression. Conditional small SDK/consumer pilot only if separately accepted and capacity remains. **Excluded:** full issuer order management, automatic redemption/rebalancing, generic leverage execution, new wallets/ramps.

**Tasks:** extend portfolio projection with exact quantities/control flags, deduplication and stale marks; instrument handoff/order-to-ledger evidence without leaking KYC; implement activity uniqueness and consent; fault-inject collection/callback/ledger failures; configure metrics/alert ownership; complete threat model and monitoring plan. Use Etherfuse sandbox with provider-approved test assets; where exact mainnet assets do not exist on testnet, fixtures plus an approved equivalent demonstration must be agreed with reviewers.

**Dependencies:** P2/P3, T1, issuer test access and supported settlement evidence, existing wallets/CCTP test fixtures. **Effort:** 12–18 days; optional SDK 4–7 days and Turbolong pilot 3–5 days are additional unless equivalent work is removed. **Deliverables:** journey demo, failure/recovery runbook, portfolio projection, monitoring dashboards, updated threat model and attributed test ledger evidence.

**Acceptance:** duplicate source/callback deliveries create no duplicate claim/activity; Classic+SAC balances count once; frozen/unknown eligibility not displayed as investable; old NAV never marked fresh; source outage leaves lending available; CCTP resume/owner/destination/fee tests pass; test transaction links reconcile to exact intended assets/amounts/owner. Proposed >=99% collection completion over 14 days, counted by expected scheduled polls with source-publication completeness reported separately. Quarantined/estimated data must remain visible as such.

**Automated tests:** auth/cursor abuse, duplicate/wash attribution fixtures, changed issuer/flag, staleness/calendar, corporate actions, independent valuation fixtures, non-owner private-data attempts, interrupted CCTP recovery, SDK tarball consumer tests if included. **Demonstration:** new/returning-wallet test journey, issuer eligibility rejection, API outage/stale screen, pending settlement and replay recovery.

**Security:** enforce all critical pre-sign, owner/session and asset controls; signatures/replay controls on any partner callback; existing CCTP kill switch retained. **Risks/mitigation:** unavailable sandbox → pre-agreed equivalent evidence; unaccepted attribution → stop grant commitment before rollout. **Verification evidence:** CI, test ledger IDs, redacted provider status references, per-source reports, security/monitoring sign-off. **Mainnet readiness:** explicit go/no-go review; no production write before approval. Testnet transactions demonstrate behavior but do not satisfy mainnet outcome by themselves.

## Tranche 3 — Mainnet release and ratified usage outcome

**Objective:** ship the integration and demonstrate the agreed attributable on-chain outcome. Launch alone is insufficient under current Integration Track rules ([official track](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track)).

**Included:** controlled mainnet rollout, eligible-user Etherfuse handoff, settlement observation, public data/UI, monitoring/runbooks and reproducible outcome evidence. **Excluded:** paying for wash volume, inventing targets, counting prior SCF #45 work, forced investment and unapproved trading.

**Tasks:** apply additive migration under production change process; shadow reads then enable RWA UI; validate low-value approved transactions with independent ledger reads; maintain observation uptime/correction record; collect metric over agreed window; prepare reviewer verification package and follow-up ownership.

**Dependencies:** T2 sign-off, P3 ratification, production issuer/handoff access, eligible voluntary users, operating approvals. **Effort:** 8–12 engineering days plus user-outcome window (separate from engineer hours). **Deliverables:** deployed feature, source/API docs, release/rollback evidence, tx/operation and issuer settlement reconciliation, activity dashboard/export and final risk register.

**Acceptance:** all T2 safety/data gates continue passing; independent checks match intended asset/recipient/amount for every sampled investment; no unresolved Critical or High issue enabling wrong signing, false valuation or private data exposure; registered metric reaches panel-ratified threshold in ratified window with deduplicated supporting ledger evidence. Threshold and window remain unset until P3; this document does not claim they have been achieved.

**Automated tests:** production-safe public read smoke, feature flag and alert checks, immutable metric recalculation against frozen ledger fixture/export; no tests fabricate mainnet investment. **Demonstration:** reviewer uses public dashboard/API and independently resolves ledger transactions; supply source evidence and exclusions. **Security:** monitored flag/code/source changes, incident pause/rollback rehearsal, exact asset allowlists and explicit wallet consent. **Risks/mitigation:** insufficient genuine adoption → notify SCF early, do not manufacture volume; provider restrictions/outage → suspend affected actions and reconcile safely. **Mainnet readiness:** requires operator, security, product and data-method sign-off; outcome readiness separate from technical rollout.

## Follow-on scope and dependency removal

Spiko is the first additional issuer candidate due to public history and official Stellar contracts. SDK/Turbolong data pilot is conditional rather than a dependency of core. Full investment-condition allocation, advanced analytics, multi-issuer execution, Privy recovery/signing and Mercuryo merchant onboarding belong post-grant unless a revised approved scope explicitly trades out other work.

Each tranche has a concrete evidence bundle: commit/schema hashes, test output, public fixture/provenance references, redacted monitoring results, reviewer demo and appropriate ledger links. Architecture review is not charged as an external smart-contract audit, and no unperformed validation is described as complete. Observe official submission deadlines and notify SCF before delays; do not assume an extension.
