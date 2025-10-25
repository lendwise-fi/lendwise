---
trigger: always_on
---

### Project Context: Strategic DeFi Borrowing and Lending Analytics Dashboard

**File Location:** `.windsurf/rules/PROJECT_SUMMARY.md`

#### 1. Project Objective and Scope

This project focuses on producing the specification for an **analytics dashboard** designed to support Decentralized Finance (DeFi) users, both lenders and borrowers, in optimizing their capital allocation strategies. The core goal is to present the range of available options and calculate optimal strategies across lending protocols deployed on a specific blockchain.

The initial strategic perimeter for optimization and monitoring tools includes the leading lending protocols on Ethereum: **AAVE (V3 and V2), Morpho, and Compound (V3 and V2)**. These protocols utilize algorithmic interest rates based on pool utilization.

The specification includes formal definitions of key decision problems, expressed in a practical format suitable for implementation.

#### 2. Borrowing Side Framework (Optimization and Risk Monitoring)

The borrowing framework addresses strategic decisions for securing a loan (e.g., USDC) collateralized by an asset (e.g., ETH) across multiple venues.

**Key Optimization Problems (The platform must solve these formally):**

1.  **Maximizing Borrow Capacity:** Determine the allocation of fixed collateral across venues to maximize the total borrowing amount while respecting LTV limits and keeping the weighted-average borrow rate below a predefined cap ($\text{bin}$).
2.  **Minimizing Required Collateral:** Determine the smallest collateral allocation required to reach a fixed borrowing target ($\text{Bin}$), while respecting LTV limits and the maximum weighted-average borrow rate ($\text{bin}$).
3.  **Minimizing Borrowing Cost:** Minimize the overall interest cost for a fixed borrow size ($\text{Bin}$) and fixed collateral amount ($\text{Cin}$).

**Risk Monitoring Essentials:**

- **Health Factor (HF):** The HF is the core solvency metric, defined as $\text{HF}_i = \text{LLTV}_i / \text{LTV}_i$. A value below 1 triggers liquidation.
- **Price Buffer:** A maximum price decline (buffer) is introduced to determine a safe borrowing limit ($\text{maxLTV}_i$). This buffer can be recommended based on historical worst-observed price drops.
- **Monitoring Bar:** The dashboard must display three zones: **Safe zone** ($\text{HF}_i \ge 1/(1-\text{buffer})$), **At Risk zone** ($1 \le \text{HF}_i < 1/(1-\text{buffer})$), and **Liquidation zone** ($\text{HF}_i < 1$). Alerts are triggered when a position enters the At Risk zone.
- **Actionable Recommendations:** When a position is At Risk, the dashboard must recommend the required **repay amount** ($\text{Bout}_i$) or **collateral top-up** ($\text{Cin}_i$) to restore the position to the safe $\text{maxLTV}_i$ level.
- **Market Concentration:** Track the supply concentration (share of deposits held by top users) to monitor structural market vulnerability.

#### 3. Lending Side Framework (Yield Optimization and Diversification)

The lending framework focuses on allocating capital $x = (x_1, \dots, x_n)$ across $n$ lending venues (vaults) to maximize the expected portfolio yield $\sum_{i=1}^{n} x_i s_i$.

**Optimization Goal:**

- **Maximize Expected Yield** while maintaining diversification.
  - The optimization is subject to ensuring full capital allocation ($\sum x_i = 1$) and meeting a minimum diversification score $D^*$.

**Risk Management and Venue Selection:**

- **Diversification Metric ($D(x)$):** Measures how evenly capital is distributed, scaled between $1/n$ and 1. Predefined diversification categories include Highly diversified ($D^*=80\%$), Moderately diversified ($D^*=60\%$), and Low diversification ($D^*=40\%$).
- **Risk Ratings:** Integration of **Credora Network risk ratings** (A+ to D) is required for Morpho vaults to support risk-aware decision-making.
- **Venue Analytics:** Users need access to historical rate data, including Average supply rate, Rate volatility, and **Value at Risk (VaR)** estimates to assess stability and downside potential.

#### 4. Data Requirements and Time Horizon

Optimization results rely heavily on current and historical market conditions.

**Required Market Data Inputs:**

- **Liquidity Profile:** Total supplied ($\bar{L}_i$) and borrowed ($\bar{B}_i$) amounts.
- **Collateral Price:** $p_i$ (collateral price in units of the loan asset).
- **Interest Rate Model Parameters:** Support for AAVE-style models ($r_{\text{base}}, r_{\text{slope}1}, r_{\text{slope}2}, u^*$) and Morpho-style models ($r_{\text{target}}, u^*, k_p, k_d$).
- **Data Updates:** All relevant data points must be fetched and updated continuously, ideally on an **hourly basis**, to ensure accurate optimization outputs.

**Investment Horizon Adjustment:**

The optimization logic must adapt based on the user's selected investment horizon, determining how market conditions are evaluated:

- **Intraday** (less than 24 hours): Uses real-time data.
- **Short-term** (2 to 7 days): Uses 1-day average metrics.
- **Medium-term** (1 to 6 months): Uses rolling monthly averages.
- **Long-term** (beyond 1 year): Uses rolling yearly averages.

**Data Sources:** Data collection relies on multiple sources: Messari subgraphs (AAVE, Compound, historical snapshots), AAVE official subgraphs (interest rate parameters), Compound community subgraphs, and the Morpho subgraph/public data API (current and historical data for markets and vaults).

#### 5. Future Development: Cross-Chain Capabilities

The framework is designed to be extended to support full **cross-chain optimization** for both borrowing and lending.

- **Cross-Chain Logic:** Users can deploy capital or collateral across multiple networks simultaneously.
- **Bridging Costs:** Inter-chain friction (bridging costs, denoted $\gamma_j$) must be explicitly integrated into the objective function to ensure that recommendations for cross-chain reallocation are only made when the expected benefit outweighs the cost.
