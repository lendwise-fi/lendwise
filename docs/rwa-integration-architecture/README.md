# Technical Architecture

Read the [Technical Architecture](TECHNICAL_ARCHITECTURE.md) for the complete system design. The supporting documents below cover its data model, integrations, security and implementation plan.

The architecture is organized by subsystem and integration flow, covering Etherfuse data and investment, Privy, reserve/fee sponsorship, Mercuryo, Spiko and Ondo data, portfolio comparison, public GraphQL, the SDK and operational reporting. **Existing** and **new** labels distinguish repository capabilities from work still to implement. This documentation update does not deploy those integrations.

The main architecture is the source of truth for submitted-scope commitments. Supporting documents provide focused background, interface examples and earlier assessments; their candidate lists or conditional classifications do not override the complete scope defined in the main document.

## Documents

| Document                                                        | Responsibility                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Existing system assessment](EXISTING_SYSTEM_ASSESSMENT.md)     | Code, interfaces, deployment evidence and discrepancies                                                       |
| [Technical feasibility matrix](TECHNICAL_FEASIBILITY_MATRIX.md) | Provider evidence, dependencies and inclusion decisions                                                       |
| [Technical Architecture](TECHNICAL_ARCHITECTURE.md)             | End-to-end implementation design: modules, ingestion, transactions, calculations, API, signing and operations |
| [RWA data model](RWA_DATA_MODEL.md)                             | Entities, precision, migrations, positions and compatibility                                                  |
| [Yield normalization](YIELD_NORMALIZATION_METHODOLOGY.md)       | Financial definitions, equations, assumptions and leverage                                                    |
| [Integration specifications](INTEGRATION_SPECIFICATIONS.md)     | Adapters, ingestion, history, portfolio and CCTP                                                              |
| [SDK and API](SDK_AND_API_DESIGN.md)                            | Additive GraphQL, generic SDK and Turbolong consumption                                                       |
| [Onboarding](ONBOARDING_ARCHITECTURE.md)                        | Wallet and funding integration background                                                                     |
| [Security and risk](SECURITY_AND_RISK_ASSESSMENT.md)            | Threats, controls, tests and residual risks                                                                   |
| [Implementation roadmap](IMPLEMENTATION_ROADMAP.md)             | Delivery phases, dependencies and acceptance criteria                                                         |
| [Delivery readiness](DELIVERY_READINESS.md)                     | Release boundaries, evidence and settlement attribution                                                       |
| [Competitive differentiation](COMPETITIVE_DIFFERENTIATION.md)   | Evidence-based positioning and claims to avoid                                                                |
| [Open questions](OPEN_QUESTIONS.md)                             | Owners, required evidence, fallbacks and blockers                                                             |
| [Sources](SOURCES.md)                                           | Official references, dated checks and evidence limitations                                                    |
| [Review findings](INDEPENDENT_REVIEW.md)                        | Architecture, financial, security and documentation audit                                                     |

[Design contracts](examples/contracts.ts), [GraphQL schema](examples/rwa-extension.graphql) and [query examples](examples/queries.graphql) specify proposed interfaces. They are not an implemented adapter or published SDK. Public API excerpts are in [evidence](evidence/); [external reference checks](external-link-checks.json) retain source-link verification records.

## Architecture coverage

| Workstream              | Required implementation                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Etherfuse foundation    | Exact Stellar identities, public prices/rates/supply, source-backed history, revision-safe collection and typed returns |
| Wallet and sponsorship  | Privy email sign-in, SEP-10, sponsored account/trustlines, controlled fee bumps and recovery                            |
| Funding                 | Mercuryo qualification and Mainnet receipts; orchestration around the existing CCTP route                               |
| Additional data         | Spiko and Ondo USDY adapters, exact mappings, financial terms and explicit unavailable fields                           |
| Product experience      | RWA/lending comparison, exact holdings, valuation and condition-aware optimizer screening                               |
| API and SDK             | Additive public GraphQL, independent typed SDK, npm release, consumer example and versioned documentation               |
| Etherfuse investment    | Approved quote/swap route, validated user signing, receiving-leg verification and portfolio refresh                     |
| Security and operations | STRIDE model, corresponding monitoring plan, production alerts, recovery and collection report                          |
| Onchain outcomes        | Eligible-account evidence, 30-day average net assets and 60-day gross qualifying USDC receipts                          |

Provider access and security checks are activation gates for committed integrations. Data polling, API usage and wallet creation do not prove settlement. The intended Turbolong pilot is not a mandatory external deployment. Additional issuer trading, fiat off-ramp, MCP and generalized leveraged execution remain outside the submitted scope.

## Baseline and verification

Repository: [lendwise-fi/lendwise](https://github.com/lendwise-fi/lendwise). Assessment baseline is `main` at `65072b13db1792eecf3ae5330cf4dbc8ec1cb4bd`. The compared `testnet` tree at `4e779a1b62ccd9b555d2d0f64276f55603b11907` matched that tree. Branch names alone do not prove a deployment is running a particular commit.

All new components are **proposed**. Documented provider functionality does not imply a completed LendWise integration. No smart-contract implementation audit, issuer reserve audit, production penetration test or compliance approval was performed.

Run the local documentation checks:

```bash
node docs/rwa-integration-architecture/validate.mjs
```

Set `MERMAID_VALIDATION_ROOT` to an isolated installation containing Mermaid and jsdom to enable diagram parsing. The compiler and formatter checks are recorded in the review findings.
