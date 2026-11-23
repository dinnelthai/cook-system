# Initial Inventory & Demand Absorption Model — V1

- Status: Research derivation
- Version: 0.1
- Scope: Pump.fun bonding-curve phase before graduation
- Purpose: Quantify supply concentration, latent sell-overhang, and observed independent demand for defensive market-quality analysis
- Mode: Offline analysis / simulation only

## 1. Research question

A token can show rising price and high gross turnover while its supply remains concentrated and independent demand remains weak.

V1 must answer:

1. Who currently holds the token supply, and how much of that attribution is verified?
2. Which holders acquired inventory early, and how much remains with them?
3. How much token inventory could plausibly become sell pressure under explicitly stated stress assumptions?
4. How much net inventory is being accumulated by independent market participants?
5. How sensitive is the bonding curve to a hypothetical sell-pressure shock at its current state?

This model is for risk measurement and defensive simulation. It does not calculate when an issuer should sell, optimize an exit, or prescribe live order sizes or execution sequences.

## 2. Supply conservation and accounting

Use the exact mint supply and program-account semantics from chain state. At a point in time t, define:

S_mint,t = S_curve,t + S_wallet,t + S_burned,t + S_escrow,t + S_other_program,t

Where:

- S_curve,t: actual token inventory held by the bonding-curve program, not virtual token reserves.
- S_wallet,t: sum of token balances in user-controlled token accounts after owner-level aggregation.
- S_burned,t: provably burned supply.
- S_escrow,t: supply in known escrow / vesting / custody accounts.
- S_other_program,t: other program-controlled balances, explicitly classified.

The equality is a reconciliation invariant, subject to token extensions, withheld amounts, and the exact token-program semantics. Any unexplained difference becomes a data-quality alert; do not force the ledger to balance by inventing a category.

### 2.1 Two separate inventory ledgers

Do not conflate current ownership with acquisition history.

**Current-holder ledger**

Records who currently holds each balance, aggregated from token accounts to owner addresses where supported.

**Acquisition-cohort ledger**

Records how inventory entered a holder's possession:

- creator / launch allocation, if verifiable;
- early curve purchase;
- later curve purchase;
- transfer received;
- unknown provenance.

If an early buyer transfers tokens to a new wallet, the current holder changes but the acquisition provenance does not. Preserve both facts. Transfers are not market buys or sells and must not be counted as executed trading volume.

### 2.2 Address and owner normalization

- Preserve raw token-account addresses and owner addresses.
- Deduplicate multiple token accounts belonging to one owner.
- Keep custody, exchange, multisig, program, and pool accounts separately labeled where identifiable.
- Do not assume one address equals one person.
- Do not assume a shared funder proves common ownership.

## 3. Holder attribution model

Every balance belongs to one observed address, but economic control may be uncertain. Report three attribution bands:

1. **Directly verified** — supported by explicit authority, documented creator account, or other strong on-chain evidence.
2. **Probable association** — supported by multiple independent signals, with evidence and confidence shown.
3. **Unknown / unclassified** — insufficient evidence.

For wallet i, store:

- current balance B_i;
- acquisition cohort;
- direct attribution evidence;
- relationship evidence and confidence interval;
- transfer history;
- observed buys and sells;
- data completeness.

Do not turn a probabilistic wallet relationship into a categorical accusation. Show raw-address concentration alongside any cluster-adjusted estimate.

## 4. Supply concentration metrics

Let s_i be holder i's share of the chosen supply denominator. The denominator must be stated (mint supply, circulating supply proxy, or transferable free float) and must not change silently between charts.

### 4.1 Top-holder share

Top-k share:

TopK_k = sum of the k largest holder shares

Report several k values and separately exclude / include known program, pool, exchange, and custody accounts with clear labels.

### 4.2 Herfindahl-Hirschman Index

HHI = Σ s_i²

Effective holder count:

N_eff = 1 / HHI

Report:
- raw owner-address HHI;
- evidence-cluster HHI, if available;
- unknown-address share;
- attribution confidence and cluster coverage.

N_eff is an effective concentration statistic, not the number of verified independent people.

### 4.3 Cohort concentration

Report balances by acquisition cohort and current-holder cohort. Do not call every early buyer a sniper or insider. Early participation is a timing observation, not proof of intent or affiliation.

## 5. Potential sell-overhang model

A holder balance is potential supply, not a sell order. A large holder may never sell; a small holder may sell immediately. V1 must therefore present stress ranges, not assert intent.

For a holder or cohort i:

- B_i: current transferable token balance.
- p_i(H): calibrated probability of some inventory being sold into the market within horizon H, conditional on observable historical features.
- c_i: confidence that the holder belongs to the relevant attribution group, when calculating issuer-associated overhang.

An illustrative expected-overhang estimate is:

O_H = Σ_i B_i × p_i(H)

For issuer-associated overhang, attribution uncertainty must also be represented:

O_H,assoc = Σ_i B_i × p_i(H) × c_i

This expected value must be accompanied by low / central / high scenario bounds. Do not use an arbitrary fixed c_i; derive it from a documented evidence model, and leave it unknown where evidence is insufficient.

For total market overhang, do not multiply by issuer-association confidence; include all relevant transferable holder balances and estimate sale propensity separately.

### 5.1 Calibration requirements

- Estimate p_i(H) only from appropriately labeled historical cohorts and observed holding / selling behavior.
- Avoid fitting and evaluating on the same tokens or time periods.
- Include right-censored holders that have not sold yet.
- Control for market age, volatility regime, liquidity state, and data completeness.
- Publish calibration error and confidence intervals.
- If training evidence is insufficient, use explicit stress scenarios (e.g. low / medium / high participation) rather than pretending to have a reliable probability.

A potential-overhang estimate is not a prediction that holders will sell and must not be presented as one.

## 6. Independent demand and absorption

Gross volume is not independent demand. Track at least four distinct quantities for a window W:

1. Gross buy notional.
2. Gross sell notional.
3. Net token accumulation by independently classified participants.
4. Net quote-asset flow by those participants.

For independently classified participant group G:

NetTokenAccumulation_G(W) = Σ_i∈G (curve_bought_tokens_i − curve_sold_tokens_i)

NetQuoteSpend_G(W) = Σ_i∈G (curve_buy_quote_i − curve_sell_quote_i)

Positive NetTokenAccumulation means the group accumulated tokens from the curve over the window. Transfers between wallets are excluded from curve buys and sells. A separate transfer ledger is retained.

### 6.1 Independence uncertainty

Wallet independence is not directly observable. Produce at least three views:

- **Strict lower bound:** only participants with strong evidence of independent activity.
- **Central estimate:** include probable independent participants using a documented model.
- **Inclusive upper bound:** include unclassified participants, clearly marked as uncertain.

Never describe any of these as verified unique human buyers.

### 6.2 Absorption rate

For a rolling lookback window W:

A_obs(W) = max(0, NetTokenAccumulation_independent(W))

AbsorptionRate(W) = A_obs(W) / duration(W)

Use robust rolling estimates (such as median rates across comparable windows) and show the full distribution. If net accumulation is zero or negative, do not manufacture a positive rate.

For a future horizon H, a simple historical-capacity proxy is:

AbsorptionCapacity_H = AbsorptionRate_reference × duration(H)

This is a scenario baseline, not a forecast. It assumes past observed demand remains relevant and must be shown alongside alternative regimes.

### 6.3 Overhang-to-absorption ratio

When the reference absorption rate is positive:

OverhangCoverageRatio_H = O_H / AbsorptionCapacity_H

Interpretation:
- Lower values mean the estimated potential supply is smaller relative to the chosen historical absorption baseline.
- Higher values mean potential supply is large relative to that baseline.
- If absorption capacity is zero or negative, mark the ratio as undefined / no observed positive absorption.

Do not set a universal “safe” threshold. Calibrate alerts by market age, curve state, and false-positive cost.

## 7. Bonding-curve stress sensitivity

For an idealized constant-product curve with virtual quote reserve X and virtual token reserve Y:

K = X × Y

P = X / Y

For a hypothetical token sell amount u, ignoring fees, integer rounding, program-specific constraints, and real-reserve limitations:

Y' = Y + u

X' = K / (Y + u)

Gross quote output in the idealized model:

QuoteOut(u) = X − X' = X × u / (Y + u)

Post-shock marginal price ratio:

P' / P = (1 + u / Y)^(-2)

This gives a useful defensive sensitivity result:

- The same hypothetical token supply shock has a larger relative price effect when u/Y is larger.
- A potential holder overhang should therefore be interpreted relative to the curve's current virtual token reserve, not only as a percentage of total supply.
- The result is an analytical stress approximation, not an exact Pump.fun sell quote.

### 7.1 Stress ratios

Overhang-to-virtual-token-reserve ratio:

CurveOverhangRatio_H = O_H / Y

Also report overhang relative to:
- current transferable supply;
- actual curve token inventory where relevant;
- actual quote reserve / program-reported available reserve, under exact program semantics.

Do not substitute virtual reserves for actual spendable reserves.

### 7.2 Important limitations

- The constant-product approximation is not a substitute for the exact Pump.fun program adapter.
- Fees, rounding, reserve accounting, and sell constraints alter realized proceeds.
- A hypothetical sale of all estimated overhang is not a prediction of actual behavior.
- The model must not produce an issuer exit schedule or recommended execution size.

## 8. Joint interpretation: inventory, demand, and curve state

No single metric is sufficient. Interpret the following dimensions together:

| Dimension | Question |
|---|---|
| Direct / probable holder concentration | Is supply concentrated among a small number of observed or associated holders? |
| Early-holder remaining balance | How much early-acquired inventory remains, and who currently holds it? |
| Independent net accumulation | Are independent participant groups accumulating tokens, not merely generating turnover? |
| Overhang-to-absorption | Is potential supply large relative to observed absorption capacity? |
| Curve sensitivity | Would a hypothetical supply shock be large relative to current virtual reserves? |
| Data reliability | Are balances, trades, transfers, and curve state reconciled? |

### Diagnostic patterns

**Pattern A: High gross volume, weak independent accumulation**

Possible explanations include arbitrage, concentrated turnover, circular flow, or a market dominated by repeat participants. Investigate counterparties, inventory changes, and cross-market activity before classifying.

**Pattern B: Rising price, concentrated remaining supply**

Price appreciation may coexist with concentrated inventory and latent supply. Show holder concentration and overhang uncertainty beside the raw candle.

**Pattern C: Many new addresses, limited independent breadth evidence**

Address count may rise due to transfers, custody, or related wallets. Separate new addresses, new owners, and evidence-based independent participant proxies.

**Pattern D: High estimated overhang, strong independent accumulation**

The market may have meaningful potential supply but also evidence of broad absorption. Avoid binary “healthy / unhealthy” conclusions; show both sides and their uncertainty.

**Pattern E: High overhang, weak or negative net independent accumulation**

This is a risk condition worth highlighting, especially when curve sensitivity is high. It remains a risk indicator, not proof of an imminent sell-off.

## 9. Simulation scenarios

All scenarios are offline, synthetic, labeled, and seeded. They are designed to test detection and risk estimates, not to provide a live-market playbook.

1. **Broad independent accumulation:** many heterogeneous participants acquire and retain inventory.
2. **Concentrated early ownership:** a small set of early holders retain a large share while later addresses increase.
3. **Transfer-inflated address count:** token transfers increase the number of holder addresses without equivalent new market demand.
4. **High-turnover / low-net-accumulation:** gross volume rises while net participant inventory changes little.
5. **Independent KOL-driven burst:** unrelated wallets respond to the same public signal; tests false positives in wallet coordination.
6. **Early-holder sell pressure:** inventory is sold by early cohorts; compare concentrated and distributed seller cases.
7. **Arbitrage-heavy turnover:** gross turnover is high but price discrepancies converge.
8. **Low-depth price shock:** a hypothetical supply shock is evaluated at different curve states.
9. **Incomplete ownership evidence:** funding history is missing or ambiguous; test confidence degradation.
10. **Indexer / balance reconciliation failure:** missing or duplicated events test whether the system suppresses unsupported conclusions.

## 10. V1 dashboard output

For every token and time window, expose:

### Supply
- Mint supply reconciliation.
- Actual curve token inventory.
- Current holder distribution.
- Direct / probable / unknown attribution bands.
- Top-holder share and HHI / effective holder count.
- Early-acquisition cohort balances.

### Demand
- Gross buy / sell quote notional.
- Net token accumulation by independence band.
- Net quote spend by independence band.
- New owner addresses versus new market buyers.
- Rolling absorption-rate distribution.

### Potential supply
- Total transferable holder inventory.
- Estimated overhang low / central / high.
- Issuer-associated overhang only where evidence supports it.
- Overhang-to-absorption ratio and undefined states.
- Overhang-to-virtual-reserve ratio.

### Curve risk
- Current virtual reserves and actual reserves.
- Program-specific quote / sell constraints.
- Hypothetical stress sensitivity with explicit assumptions.
- Curve progress and graduation state.

### Reliability
- Supply reconciliation difference.
- Event completeness.
- Balance snapshot age.
- Wallet attribution coverage.
- Program adapter version and source provenance.

## 11. Acceptance criteria

- [ ] Supply accounting reconciles against authoritative mint and program state.
- [ ] Current-holder and acquisition-cohort ledgers are separate.
- [ ] Token-account balances are normalized to owners without losing raw addresses.
- [ ] Transfers never count as curve buys, sells, or trading volume.
- [ ] Direct, probable, and unknown attribution are reported separately.
- [ ] Raw-wallet and cluster-adjusted concentration are both available.
- [ ] Overhang is labeled as potential supply, not intent or a sell prediction.
- [ ] Demand uses net accumulation and gross turnover as separate metrics.
- [ ] Independent-demand estimates include lower / central / upper confidence views.
- [ ] Absorption ratio handles zero or negative net accumulation without division artifacts.
- [ ] Curve stress uses versioned adapter semantics and labels the constant-product approximation.
- [ ] Virtual reserves and actual spendable reserves are never conflated.
- [ ] KOL-driven independent bursts and legitimate arbitrage are false-positive test cases.
- [ ] No live trading, issuer exit optimization, wallet orchestration, or deceptive activity generation is implemented.

## 12. Open questions

1. Which exact Pump.fun program revisions and token-program variants are in the initial data scope?
2. Which account snapshots are authoritative for actual curve token inventory and quote reserves?
3. How should creator-related inventory be attributed when creator authority and funding provenance are incomplete?
4. What historical sample is sufficient to calibrate holder sell-propensity without overfitting?
5. Which independent-demand lower-bound definition is robust when exchange and custody wallets are involved?
6. How should transfers, OTC movements, and liquidity migrations be represented without confusing them with market trades?
7. What alert threshold minimizes false accusations while still surfacing material concentration and absorption risk?
