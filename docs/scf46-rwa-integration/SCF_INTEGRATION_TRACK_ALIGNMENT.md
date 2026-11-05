# SCF #46 Integration Track alignment

Official rules were reviewed on 2026-11-06. Eligibility and award decisions remain with SCF. A listed provider is not an endorsement or a promise of partner access.

## Official requirements versus recommendations

The [Integration Track](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track) supports existing-traction applications integrating listed Stellar building blocks. Most requested funds should support that integration. It requires a proposed on-chain metric, threshold and window, with a registered attributable footprint. The final 40% releases against the ratified outcome, not launch alone. The panel can reject gamed activity. A narrow, disclosed user-testing allowance can reach one-third of the total; financial action incentives and broad paid acquisition are prohibited. Award-funded outreach content has financial-framing/endorsement restrictions; obtain SCF clarification on comparison-product communications.

[Etherfuse remains on the current list](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track/integration-list), alongside other possible building blocks. This satisfies provider-list selection, not applicant approval. Recheck the rotating list at submission.

The [budget/deliverable guidance](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines) specifies future deliverables, complete pre-application architecture, three delivery tranches plus acceptance payment (10/20/30/40%), a six-month maximum project timeline and 90-calendar-day tranche submission deadlines from the prior payment unless SCF confirms otherwise. Exclusions include audit, legal/entity fees, past/unrelated work and general operations; marketing has only the stated Integration Track exception. The program cap is not this project's budget. **Total request remains unspecified.**

SCF's [round listing](https://communityfund.stellar.org/awards) showed #46 submission deadline **November 9, 2026**. Verify interest-form eligibility/invitation and cutoff time with SCF; none is evidenced here. These are official-source findings, distinct from the scope/measurement recommendations below.

## Grant audit and necessary correction

The twelve-workstream proposal is too broad to defend as one integration. Reframe it as **Etherfuse integration into LendWise's existing lending intelligence and investor journey**. Fund incremental adapter/data semantics, comparison, API/UI and approved user handoff/measurement. Reuse SCF #45's CCTP, wallets, Blend and ingestion; do not request reimbursement to rebuild completed work. A generic developer SDK alone is a weak fit for this track; it is supporting distribution only, with a real consuming application and limited cost.

The analytics core is technically feasible. However, queries and charts create no on-chain activity, and the existing bridge does not itself buy an Etherfuse asset. Before submission, agree a compliant issuer journey and a credible attributable metric. If only read analytics can be delivered, seek explicit SCF acceptance or revise track/scope. An on-chain threshold cannot be left “to be defined during tranche 3.”

## Proposed measurement and attribution

Primary candidate: **cumulative eligible Etherfuse investment-settlement volume on Stellar attributable to the LendWise journey**, measured over a panel-agreed window. This is a recommendation, not an official required choice or a numeric target. A holdings-based Network Asset Value metric is an alternative only with SCF-approved definitions and attribution. It must not be confused with NAV meaning a fund's per-share net asset value.

Register the appropriate approved footprint: relevant asset issuer accounts, app-operated wallets/contracts and sponsored accounts where actually used. Etherfuse's issuer account is shared by other applications; listing it cannot attribute all its activity to LendWise. A handoff needs a provider-supported correlation or an accepted independent proof linking user consent/intent, product/asset and ledger settlement. No new tracking contract or custodial wallet is justified merely to manufacture attribution.

Recommended event record: environment/network, product and asset identity, consented journey ID, issuer order/reference hash if available, settlement tx hash and operation/event index, owner scope, quantity, settlement currency/FX source, timestamp, measurement rule version and inclusion/exclusion reason. Store privacy-sensitive correlation separately; publish aggregate evidence and ledger IDs without KYC. Ledger checks must confirm actual investment receipt/settlement, not merely a click, signature request, trustline or pending burn.

Calculate `volume = sum(unique eligible settled events converted under the agreed currency rule)`. Deduplicate transaction+operation or canonical contract event, issuer-order partial fills, replays and routed internal hops. Exclude testnet, failed/reverted/pending events, bridge-only funding already counted in SCF #45, self-generated/circular/wash transfers, unrelated issuer issuance and unverified user attribution. Distinguish gross/net subscriptions and redemptions; do not count both as new investment unless panel methodology explicitly permits it.

Provide reproducible queries/scripts, source/mapping versions, sampled chain verification and exclusions; validate measurement against an independent frozen export. Metrics must not depend solely on client analytics or self-reported provider webhooks. A dashboard is a presentation of evidence, not evidence itself.

## Scope, milestones and unresolved grant gates

The [roadmap](IMPLEMENTATION_ROADMAP.md) maps T1 working data/comparison to T2 hardened eligible-user journey and T3 mainnet+ratified outcome. Data correctness, security, tests and monitoring are integration work; provider waiting and grant-plan research are not disguised tranche-1 development. Proposed effort ranges need team and cost breakdown before a funding request. No dollar allocation or numeric activity target is invented.

Open gates: written Etherfuse data/economic terms; approved journey and attributable mainnet settlement; existing traction evidence; SCF ratification of metric/threshold/window/footprint; actual budget; eligibility/invitation; formal SCF #45 completion evidence. This architecture is **conditionally implementation-ready**, not an unconditional grant-ready application.
