# Etherfuse-first RWA integration architecture

Review date: **2026-11-06 (Asia/Dubai)**. Architecture and implementation planning only; no application, contract, migration or deployment changes are delivered here.

**Verdict: Conditionally implementation-ready.** Public Etherfuse data interfaces and Stellar asset representations have been checked. Issuer rate semantics, data-use permission and production transaction entitlements still require confirmation. Optional wallet and fiat onboarding must not block the public-data integration. See the [review findings](INDEPENDENT_REVIEW.md) for release gates and limitations.

## Documents

| Document                                                        | Responsibility                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Existing system assessment](EXISTING_SYSTEM_ASSESSMENT.md)     | Code, interfaces, deployment evidence and discrepancies                                                       |
| [Technical feasibility matrix](TECHNICAL_FEASIBILITY_MATRIX.md) | Provider evidence, dependencies and inclusion decisions                                                       |
| [Technical architecture](TECHNICAL_ARCHITECTURE.md)             | End-to-end implementation design: modules, ingestion, transactions, calculations, API, signing and operations |
| [RWA data model](RWA_DATA_MODEL.md)                             | Entities, precision, migrations, positions and compatibility                                                  |
| [Yield normalization](YIELD_NORMALIZATION_METHODOLOGY.md)       | Financial definitions, equations, assumptions and leverage                                                    |
| [Integration specifications](INTEGRATION_SPECIFICATIONS.md)     | Adapters, ingestion, history, portfolio and CCTP                                                              |
| [SDK and API](SDK_AND_API_DESIGN.md)                            | Additive GraphQL, generic SDK and Turbolong consumption                                                       |
| [Onboarding](ONBOARDING_ARCHITECTURE.md)                        | Privy, Mercuryo and existing-wallet fallbacks                                                                 |
| [Security and risk](SECURITY_AND_RISK_ASSESSMENT.md)            | Threats, controls, tests and residual risks                                                                   |
| [Implementation roadmap](IMPLEMENTATION_ROADMAP.md)             | Delivery phases, dependencies and acceptance criteria                                                         |
| [Delivery readiness](DELIVERY_READINESS.md)                     | Release boundaries, evidence and settlement attribution                                                       |
| [Competitive differentiation](COMPETITIVE_DIFFERENTIATION.md)   | Evidence-based positioning and claims to avoid                                                                |
| [Open questions](OPEN_QUESTIONS.md)                             | Owners, required evidence, fallbacks and blockers                                                             |
| [Sources](SOURCES.md)                                           | Official references, dated checks and evidence limitations                                                    |
| [Review findings](INDEPENDENT_REVIEW.md)                        | Architecture, financial, security and documentation audit                                                     |

[Design contracts](examples/contracts.ts), [GraphQL schema](examples/rwa-extension.graphql) and [query examples](examples/queries.graphql) specify proposed interfaces. They are not an implemented adapter or published SDK. Public API excerpts are in [evidence](evidence/); [external reference checks](external-link-checks.json) record the earlier source-link verification.

## Recommended scope

| Workstream                                | Classification        | Commitment                                                                                                                    |
| ----------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Etherfuse Stablebonds                     | Core MVP              | USTRY and CETES first: verified Stellar identifiers, indicative rates, issuer price marks, prospective history and comparison |
| Standardized financial/history data       | Core MVP              | Separate RWA model, provenance, metric semantics and source-native cadence                                                    |
| Unified comparison                        | Core MVP              | Common discovery shell with explicit financial categories and horizon assumptions                                             |
| Essential GraphQL                         | Core MVP              | Additive public read queries; preserve all lending fields                                                                     |
| Existing CCTP                             | Core reuse            | Existing wallet transfer and funding handoff; an on-chain mint is distinct from investment                                    |
| RWA portfolio                             | Conditional extension | Public balances and valuation marks, subject to verified mapping and rights/control disclosures                               |
| Issuer investment journey                 | Conditional extension | Requires approved customer access, exact transaction interfaces, user consent and settlement reconciliation                   |
| SDK and Turbolong                         | Conditional extension | Generic read client and consumer pilot after an accepted interface and partner commitment                                     |
| Additional issuers                        | Later roadmap         | Spiko first candidate; other issuers require separate technical validation                                                    |
| RWA optimization                          | Later roadmap         | Informational screening first; allocation and execution require additional constraints and evidence                           |
| Privy and Mercuryo                        | Later roadmap         | Exact signing, recovery, merchant, network and lifecycle tests required                                                       |
| Autonomous regulated investment execution | Out of scope          | No issuer approval bypass, custody service or automatic leveraged rebalancing                                                 |

The public-data release does not depend on optional transaction journeys. Data queries and dashboard visits are off-chain activity. Any product-usage claim involving investment must be backed by correctly attributed ledger settlement.

## Baseline and verification

Repository: [lendwise-fi/lendwise](https://github.com/lendwise-fi/lendwise). Assessment baseline is `main` at `65072b13db1792eecf3ae5330cf4dbc8ec1cb4bd`. The compared `testnet` tree at `4e779a1b62ccd9b555d2d0f64276f55603b11907` matched that tree. Branch names alone do not prove a deployment is running a particular commit.

All new components are **proposed**. Documented provider functionality does not imply a completed LendWise integration. No smart-contract implementation audit, issuer reserve audit, production penetration test or compliance approval was performed.

Run the local documentation checks:

```bash
node docs/rwa-integration-architecture/validate.mjs
```

Set `MERMAID_VALIDATION_ROOT` to an isolated installation containing Mermaid and jsdom to enable diagram parsing. The compiler and formatter checks are recorded in the review findings.
