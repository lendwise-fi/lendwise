# SCF #46: Etherfuse-first RWA integration architecture

Review date: **2026-11-06 (Asia/Dubai)**. Architecture and implementation planning only; no application, contract, migration, or deployment changes are delivered here.

**Verdict: Conditionally implementation-ready.** The read-only Etherfuse integration has working public data interfaces and a concrete design. A funded Integration Track submission still needs issuer data-use/rate semantics confirmation and a panel-accepted, attributable on-chain outcome. Wallet and fiat onboarding are optional; they must not block Etherfuse delivery. See [independent review](INDEPENDENT_REVIEW.md) for release gates and limitations.

## Read this package

| Document                                                        | Responsibility                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| [Existing system assessment](EXISTING_SYSTEM_ASSESSMENT.md)     | Code, interfaces, deployment evidence and discrepancies      |
| [Technical feasibility matrix](TECHNICAL_FEASIBILITY_MATRIX.md) | Provider-by-provider evidence and inclusion decisions        |
| [Technical architecture](TECHNICAL_ARCHITECTURE.md)             | Boundaries, reuse, optimization and nine ADRs                |
| [RWA data model](RWA_DATA_MODEL.md)                             | Entities, precision, migrations, positions and compatibility |
| [Yield normalization](YIELD_NORMALIZATION_METHODOLOGY.md)       | Financial definitions, equations, assumptions and leverage   |
| [Integration specifications](INTEGRATION_SPECIFICATIONS.md)     | Adapters, ingestion, history, portfolio and CCTP             |
| [SDK and API](SDK_AND_API_DESIGN.md)                            | Additive GraphQL, generic SDK and Turbolong consumption      |
| [Onboarding](ONBOARDING_ARCHITECTURE.md)                        | Privy, Mercuryo and existing-wallet fallbacks                |
| [Security and risk](SECURITY_AND_RISK_ASSESSMENT.md)            | Threats, controls, tests and residual risks                  |
| [Implementation roadmap](IMPLEMENTATION_ROADMAP.md)             | Pre-submission gates, tranches and acceptance criteria       |
| [SCF alignment](SCF_INTEGRATION_TRACK_ALIGNMENT.md)             | Current rules, activity attribution and funding constraints  |
| [Competitive differentiation](COMPETITIVE_DIFFERENTIATION.md)   | Evidence-based positioning and claims to avoid               |
| [Open questions](OPEN_QUESTIONS.md)                             | Owners, required evidence, fallbacks and blockers            |
| [Sources](SOURCES.md)                                           | Official references, live checks and evidence limitations    |
| [Independent review](INDEPENDENT_REVIEW.md)                     | Separate architecture, financial, security and grant review  |

[Executable design examples](examples/contracts.ts) define the proposed public types; [validation](validate.mjs) checks this package. Examples are design contracts, not an implemented adapter or published SDK. Public API excerpts are in [evidence](evidence/), with [external reference checks](external-link-checks.json) recording link validation.

## Recommended scope

| Workstream                                | Classification                                            | Commitment                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Etherfuse Stablebonds                  | Core Integration Track MVP                                | USTRY and CETES first; verified Stellar identifiers, indicative rates, prices, native-currency history collected prospectively, comparison and issuer handoff |
| 2. Additional Stellar issuers             | Stretch goal                                              | Spiko first candidate; others require separate validation                                                                                                     |
| 3. Standardized financial/history data    | Core Integration Track MVP                                | Separate RWA model, provenance, metric semantics and real source cadence                                                                                      |
| 4. Unified comparison                     | Core Integration Track MVP                                | Common discovery shell, explicit financial categories, horizon scenarios                                                                                      |
| 5. RWA portfolio                          | Conditional MVP — dependent on confirmed external support | Public Etherfuse balances and NAV marks technically feasible; product mapping and legal-status wording must pass review                                       |
| 6. Optimization                           | Stretch goal                                              | Informational screening; full allocation/rebalancing post-grant                                                                                               |
| 7. GraphQL extensions                     | Core Integration Track MVP                                | Additive public read queries; preserve all lending fields                                                                                                     |
| 8. `@lendwise/sdk`                        | Conditional MVP — dependent on confirmed external support | Small read-only client if there is a committed consumer; no execution engine                                                                                  |
| 9. Turbolong                              | Conditional MVP — dependent on confirmed external support | Data-consumption pilot, contingent on partner specification and acceptance                                                                                    |
| 10. Mercuryo                              | Post-grant roadmap                                        | Stellar products exist; partner configuration, jurisdictions and lifecycle untested                                                                           |
| 11. Privy                                 | Post-grant roadmap                                        | Native Stellar creation and signing documented; exact Soroban/SEP-10 flows untested                                                                           |
| 12. Existing CCTP                         | Core Integration Track MVP                                | Reuse routing and funding handoff; no bridge rebuild and no claim that a mint buys an RWA                                                                     |
| Autonomous regulated investment execution | Out of scope                                              | No issuer approval bypass, custody service or automatic leveraged rebalancing                                                                                 |

The read-only feature set alone does **not** resolve the grant's on-chain success requirement. The minimum complete grant journey also needs an eligible user handoff to Etherfuse and verified settlement attribution accepted by SCF. This is a pre-submission gate, not a promised future metric. No budget or numeric activity target is invented.

## Evidence and Git baseline

Repository: [lendwise-fi/lendwise](https://github.com/lendwise-fi/lendwise). Assessment and branch baseline is remote production branch `main` at `65072b13db1792eecf3ae5330cf4dbc8ec1cb4bd`, explicitly selected by the user. Default `testnet` at `4e779a1b62ccd9b555d2d0f64276f55603b11907` has the same file tree. Original local checkout was older `main` at `e88131ab159dca5b04beb3234766e6da08726e34`. Remote production and pre-production heads were fetched for comparison. Branch labels are deployment conventions, not proof of a particular deployment running a particular SHA.

`gh auth status` identifies `Frihat-dev` with pull-only access. Historical Leonard-authored commits on `mvp` resolve to **`lelo-cell`**, not `lenoard`; its public key matches the existing local SSH key. The user explicitly authorized reuse of that prior identity. SSH authenticated as `lelo-cell`; a documentation-branch push dry run succeeded. No CLI account or stored credentials were changed. Branch: `docs/scf46-rwa-integration-architecture`, based on `main`. Commit/push outcome is reported in the final delivery message. No PR is authorized.

The pre-existing untracked `docs/tranche-1-mvp.md`, `docs/tranche-2-testnet.md`, and `docs/tranche-3-mainnet.md` are user work, excluded from this change. They are not treated as authoritative implementation evidence.

All new components in this package are **proposed**. Source-confirmed functionality does not imply LendWise has integrated it. No smart-contract implementation audit, issuer reserve audit, production penetration test or compliance approval was performed.
