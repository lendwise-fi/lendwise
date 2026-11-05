# Delivery readiness and settlement evidence

Public data, private account servicing, investment execution and product-usage measurement require different evidence. A completed public-data integration must not imply an approved transaction journey.

## Release boundaries

| Capability                           | Evidence required                                                                                           | Safe fallback                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Public observations                  | Approved asset identity, source schema, data-use permission and accurately labelled financial convention    | Permitted metadata and issuer-indicative values only; effective annual rate stays null when unjustified |
| Historical comparison                | Source timestamps, actual observations, known distribution/fee treatment and reproducible derivations       | Start at first collection; show missing periods rather than fabricated returns                          |
| Public positions                     | Exact asset mapping, decimals, control flags, valuation source and duplicate prevention                     | Unpriced/stale position with explicit reason; no assumed redemption right                               |
| Issuer journey                       | Provider approval, supported investors/countries, exact interface, user consent and settlement verification | Discovery-only view until all route dependencies pass                                                   |
| Third-party distribution             | Stable schema, consumer contract, freshness/error behavior and data rights                                  | Public API documentation before committing to a packaged client                                         |
| Embedded wallets and fiat onboarding | Tested ownership/signing/recovery, merchant enablement, native network delivery and failure handling        | Existing wallets, separately acquired XLM and existing CCTP                                             |

The [roadmap](IMPLEMENTATION_ROADMAP.md) separates a working data MVP, a hardened optional journey and controlled mainnet operation. The [open questions](OPEN_QUESTIONS.md) assign required evidence to proposed owners. These are implementation gates, not completed agreements.

## Product usage and attribution

Queries, charts and dashboard visits are off-chain analytics. They cannot be reported as on-chain investment activity. Existing CCTP transfers demonstrate asset movement, not purchase of an RWA. Public balances and issuer-wide supply do not establish usage caused by LendWise.

If investment activity is reported, use independently verified settled events linked to an approved user journey. A shared issuer account serves many applications: its total issuance or holder growth is insufficient attribution. Establish provider-supported correlation or equivalent evidence before making an application-specific claim.

A proposed event record includes environment/network, exact product and asset identity, consented journey reference, issuer order/reference hash where available, transaction hash and operation/event index, quantity, settlement currency, FX source, timestamp, measurement-rule version and inclusion/exclusion reason. Keep personal correlation private; publish aggregates and public ledger evidence without KYC records.

Reproduce reported volume as the sum of unique eligible settled events under an explicit currency rule and measurement window. Reconcile partial fills and routed hops. Exclude testnet from mainnet metrics, failed/reverted/pending events, replayed callbacks, unrelated issuance, circular transfers and unsupported attribution. Distinguish subscriptions, redemptions and bridge transfers instead of counting all as new investment.

Validate measurement against an independently reconstructed ledger export. Client analytics and provider callbacks are useful correlations but cannot replace chain settlement evidence. A dashboard presents underlying records; it does not establish their correctness.

## Operational acceptance

Deploy additive schema changes, validate migrations against the target schema and rehearse feature-flag rollback. Run shadow collection and source reconciliation before enabling public readers. Keep issuer credentials and private servicing data outside public GraphQL and shared caches.

Before enabling a transaction path, identify its operator and incident owner; validate owner-bound intent, network, asset, amount, destination, sequence, fees, simulation and expiry. Test interruption, duplicates and uncertain-submission recovery. Record provider-controlled recovery limits instead of promising refunds.

Retain a release evidence bundle containing commit/schema versions, source fixtures, financial-method versions, test output, quality reports, rollback evidence and ledger references. Usage targets and windows require an explicit product specification. No target or commercial permission is assumed here.

## Current conclusion

The public-data design is **conditionally implementation-ready** pending economic semantics and data-use confirmation. Native issuer execution, private servicing, embedded wallets and fiat onboarding remain conditional. Observed provider capabilities and transaction evidence are dated in [sources](SOURCES.md); they do not replace production access, consumer contracts or operating sign-off.
