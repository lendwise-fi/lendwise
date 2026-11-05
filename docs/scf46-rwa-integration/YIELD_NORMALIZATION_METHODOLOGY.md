# Financial yield normalization and comparison

Financial correctness is a security property. The common display primitive is a typed observation, **not one universal APY**. The canonical fields are in [contracts](examples/contracts.ts); data validation and revision policy are in [data model](RWA_DATA_MODEL.md).

## Metric dictionary

| Metric                        | Meaning                                                                                                                   | Allowed comparison / prohibition                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Lending supply APY            | Effective annualized supply growth under stated compounding and an unchanged spot rate; rewards may be separate           | Same currency/horizon and fee/reward assumptions; not a guaranteed rate                                                        |
| Lending borrow APY            | Effective annualized financing cost under stated rate model                                                               | Cost to be integrated along actual debt path; never simply subtracted from an unrelated advertised yield                       |
| Bond YTM                      | Discount rate solving the price/cash-flow equation under specified day count, coupon convention and redemption cash flows | Hold-to-maturity scenario with no default and stated reinvestment assumptions; not a return forecast at an arbitrary exit date |
| Current yield                 | Annual coupon cash divided by a specified current price basis                                                             | Income measure excluding price change and principal pull-to-par; not effective total return                                    |
| Distribution yield            | Historical or indicated distributions divided by specified price/NAV                                                      | Identify period and whether distributions include return of capital; do not add distributions already included in total return |
| MMF yield                     | Fund-defined income measure, e.g. trailing seven-day current yield or effective yield                                     | Preserve the exact formula and fee waiver treatment; do not assume every MMF yield compounds identically                       |
| NAV historical total return   | Change in share value plus properly accounted income, with explicit reinvestment/cash assumptions                         | Realized historical window; cannot be compared as a forward promise                                                            |
| Issuer indicative return/rate | Provider-published annualized indication with potentially unknown convention                                              | Preserve source value; effective annual rate remains null until method known                                                   |

Independently tag gross/net, fixed/floating, accrued/distributed/mixed and historical/forward-indicative/spot-variable. Fees paid through NAV are not deducted again. A fixed coupon does not mean a token's market return, FX conversion or rolling portfolio yield is fixed.

## Observation contract and units

Every normalized observation retains original value/unit/metric; optional decimal/effective annual values; equation/method version; day count and compounding; currency; calculation interval; observation, source publication and collection times; fee assumptions; provenance hash; origin and quality/missing state. `availableAt` tracks when the platform could know the value. A retrieval time cannot substitute for a missing source publication timestamp.

Numbers are dimensionless decimal rates: 5% = `0.05`, 369 basis points = `0.0369`. Unit conversion does not establish compounding. `current_basis_points` from Etherfuse becomes `ISSUER_INDICATIVE_RATE`, decimal `0.0369` in a corresponding illustrative observation; effective annual rate stays null until the provider confirms it. Current values must come from [captured source data](evidence/etherfuse-prices.json), never from this example.

The repository's [Blend spot adapter](../../src/lib/protocols/blend/v2/apy-spot.ts) converts SDK APR to daily-compounded APY; [utilities](../../src/lib/utils.ts) also contain per-second conversion. This is a display convention, not proof that actual supply rewards compound daily. Preserve existing lending output for compatibility; new comparison views disclose its convention and source APR where available. Existing daily averaged APY is an average of quotes, not a realized time-weighted investor return.

## Equations

Let H be horizon in years according to a named day-count basis. For actual days d under ACT/365F, `H=d/365`; ACT/360 is different. Do not use an assumed 365 basis for every product.

**Known nominal APR r compounded m times/year**:

`APY = (1 + r/m)^m - 1`, provided the compounding contract applies and `1+r/m > 0`.

For 5% nominal APR, daily-compounded APY is approximately 5.12675%. For an effective APY a, unchanged-rate horizon growth is `G(H)=(1+a)^H`. For a simple annual rate s, horizon growth is `1+s*H`. These are different contracts. Continuous nominal rate c gives `exp(c*H)`.

**Variable lending rate path:** for piecewise nominal rates with known accrual intervals `dt_k`, use the actual protocol balance-index ratio when available; otherwise a labeled model such as `G=product_k(1+r_k*dt_k)` or `exp(sum_k r_k*dt_k)` under its stated compounding assumption. Debt is integrated on outstanding principal; future rates require scenarios. Spot APY extrapolation is not a historical return calculation.

**Bond price and YTM:** for coupon frequency m and cash flows CF_j at fractional years t_j,

`P_dirty = sum_j CF_j / (1 + y/m)^(m*t_j)`.

Use settlement date, accrued coupon and actual instrument calendar. If a price is clean, add accrued interest to obtain the cash settlement price. YTM root finding requires a valid cash-flow schedule and domain; multiple sign changes can create ambiguous yields. A rolling Stablebond pool has no automatic single security maturity/YTM. Do not infer maturity from the tenor of an underlying bond.

Example: zero-coupon bond with price 98, repayment 100, one half-year left, one compounding period/year convention: `y=(100/98)^(1/0.5)-1≈4.12328%`. Holding-period return is 2.04082%. Selling after one month has unknown price risk; 4.12328% is not that one-month return.

**Fund total return without reinvestment**, one initial share, no external contributions/withdrawals or splits:

`R=(NAV_end + sum(distributions_per_initial_share) - NAV_start)/NAV_start`.

Example NAV 100→101 plus a cash distribution 0.50 gives 1.5%, while NAV-only return is 1%. Reinvested total return instead follows share units: at each payout, `q_next=q_prev*(1+D_per_share/NAV_reinvestment)`; final wealth is `q_end*NAV_end`, with costs and split factors applied. For example two intervals, NAV 100→99 with 2 distributed/reinvested at 99, then NAV 99→100 with no payout gives `(101/100)*(100/99)-1≈2.02020%`. Simply adding all per-share payouts assumes no reinvestment and must be labeled accordingly.

For external portfolio cash flows use time-weighted linked subperiod returns for investment performance, or money-weighted XIRR with all dated cash flows for investor experience. Do not treat incoming transfers as income. Distributions consisting of newly issued shares require an exchange/reinvestment model, not an extra cash payment assumption.

**Annualized historic effective return**: `a=(1+R)^(1/H)-1` only for positive starting wealth, `R>-1`, and a valid time span. It is historical annualization. Proposed UI policy: windows shorter than 30 calendar days show period returns only, even if an annualization is mathematically defined. Do not annualize missing/repeated/stale NAVs or manufacture a zero during a holiday.

**Net investor horizon return** with known entry cost f_in, exit cost f_out, invested capital C, terminal asset factor G and fixed costs K:

`W_H = (C - f_in)*G - f_out - K`, `R_net=(W_H-C)/C`.

If entry/exit fees are fractions e/x of transaction value: `W_H=C*(1-e)*G*(1-x)-K`. Recurrent NAV-based management costs are modeled only if absent from G; taxes stay excluded/unknown unless investor-specific inputs are provided. For C=10,000, e=0.002, x=0.001, effective gross a=5%, d=90, K=0: `W_H≈10,090.69`, `R_net≈0.9069%`. The 5% advertised annual number does not mean a 5% gain over 90 days.

**FX:** let X_t be USD per one local currency unit. Unhedged USD return is `(1+R_local)*(X_end/X_start)-1`, before conversion fees. With local return +6% and the local currency depreciating 10% versus USD, USD return is `1.06*0.90-1=-4.6%`. Etherfuse reports USD-to-local rates; invert them deliberately. Cross-currency examples without a future FX scenario are not comparable forecasts.

**Liquidity:** an issuer price mark is not executable liquidation value. Mark `V=q*NAV*FX`; separately estimate proceeds using an executable bid, fees, depth/slippage and redemption delay where available. A regulatory gate, freeze or missing exit route can make liquidatable value unknown even while the mark is positive. A matured underlying security need not make the token immediately redeemable.

## Valid comparison workflow

Compare two lending spot APYs only as unchanged-rate scenarios with matching currency, compounding/fees and horizon. Compare NAV total-return histories only over aligned observation windows with consistent distribution handling. Compare bonds and lending by dated horizon cash outcomes using modeled exit prices and rate paths, not by sorting headline yields. Preserve MMF seven-day yield as a separate labelled column until a documented transformation is possible. Show historical and forward estimates in distinct visual groups.

Every comparison returns `comparable`, `informational_only` or `not_comparable`, with reasons, model version, assumptions and sensitivity range. Eligibility, liquidity and credit risk are independent dimensions. Confidence is a vector (identity, freshness, convention, history completeness, fee completeness), not an unexplained percentage implying probability of safety.

Stale NAV: carry forward only in a valuation view with original as-of time and `carried_forward`; do not append a new reported NAV or calculate zero return from it. Holidays follow the source calendar. Negative rates/returns are allowed if valid. Zero/negative NAV, nonfinite values, inconsistent units, impossible dates and unexplained corporate actions are quarantined. Missing coupon, price, fee or FX input yields null result/reason rather than a guessed number.

## Turbolong and leverage

Let initial equity E, asset value A=L*E and debt D=(L-1)*E at inception. In the simplified same-currency buy/hold model, with no interim cash flows, accrual factors G_A/G_D and equity-proportional total costs k:

`R_equity = L*G_A - (L-1)*G_D - 1 - k`.

For one-year constant effective asset return a and borrow cost b, this reduces to `L*a-(L-1)*b-k`, not `a-b`. At L=3, a=5%, b=4%, k=0.5%, equity return is 6.5%. At a=2%, b=8%, same leverage/costs gives -10.5%. A 10% asset loss with debt growing 8% gives -46.5%, before liquidation costs. Fees/slippage paid at each loop must be represented at their actual times; a single k is illustrative.

During recursive lending, collateral and debt both evolve, supply returns and token NAV may be separate exposures, rewards may require claiming/conversion, and no constant L assumption may survive. Use a balance/cash-flow simulation per step. Confirm whether Turbolong's “Etherfuse” means a Blend pool name or a direct Stablebond holding; pool yield and underlying token price appreciation must not be counted twice.

Illustrative liquidation check only: with one asset/debt and effective collateral factor theta, `HF=theta*A/D`; liquidation is possible at HF<1. For L=3 and theta=0.8, starting HF=1.2. With static debt/parameters, an asset decline of about 16.67% reaches HF=1. Actual Blend collateral/liability factors, oracle marks, asset decimals, interest, pool state and liquidation mechanics must replace this simplified formula. FX mismatch or rising debt can cause liquidation earlier. Redemption delays do not stop on-chain liquidation; a sovereign asset can be solvent economically while its leveraged wrapper becomes insolvent.

The generic SDK safely returns typed rates/history/terms/freshness and rejects invalid transformations. Turbolong must supply collateral composition, pool IDs, debt assets, LTV/liability factors, loop/rebalance rules, swap quotes, liquidation penalties and unwind routes. LendWise historic hourly data is adequate for historical analysis, but not a liquidation oracle. Strategy execution requires fresh direct chain state and simulation; even a 30-second borrow snapshot is not an execution guarantee.

## Financial verification fixtures

Implementation tests must cover unit conversion, APR/APY inversion, negative allowed rates, zero/invalid compounding domain, irregular cash-flow schedules, clean/dirty pricing, distributions/splits, fee double counting, FX direction and loss scenarios, same-calendar interval alignment, stale/missing values, corrected historical inputs and leverage sensitivity. The design examples in [financial checks](examples/financial-checks.mjs) recompute the numerical examples independently; they do not constitute an issuer pricing-model audit.
