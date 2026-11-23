# Inner Market Mathematical Model — V1

- Status: Research derivation
- Version: 0.1
- Scope: Pump.fun pre-graduation bonding curve
- Purpose: Explain market-state mechanics and define defensive observables
- Related: inner-market-adversarial-simulator-v1.md

## 1. Core thesis

The inner market is not an order book with a discretionary market maker. It is a program-defined pricing curve whose state changes through executed trades. The Dev does not directly set the quoted price or write an arbitrary candle. The Dev is one participant with possible information, inventory, and creator-related privileges; price and volume still emerge from confirmed executions and the program state.

The key defensive question is not “how can one actor control the chart?” It is:

**Does the observed price and gross turnover represent broad, independent demand, or can the same observations be explained by concentrated inventory, correlated participants, short-lived price impact, transaction ordering, or incomplete data?**

## 2. Three coupled but distinct state layers

### 2.1 Pricing state

Let:

- X_t = virtual SOL reserve
- Y_t = virtual token reserve
- K_t = idealized invariant
- P_t = marginal curve price in SOL per token

For the simplified constant-product model:

K = X_t × Y_t

P_t = X_t / Y_t

The actual deployed program may include fees, integer rounding, partial-fill behavior, and version-specific quote rules. The simulator must use a versioned adapter for exact replay; the equations below are analytical approximations only.

### 2.2 Real reserve state

Track separately:

- X_real,t = actual quote-asset reserve held by the curve account, subject to the program's accounting semantics.
- Y_real,t = actual token inventory available to the curve.
- Fee balances and creator / protocol fee destinations.
- Completion / graduation state.

Virtual reserves determine the curve's pricing behavior. They are not a substitute for actual spendable balances. Never infer withdrawable SOL from virtual SOL reserves.

### 2.3 Inventory state

For every wallet i, maintain:

- token balance H_i^token
- quote-asset balance H_i^quote
- cumulative buy and sell notional
- transfers in and out
- first-seen time and first-trade time
- funding-source evidence
- relationship evidence and confidence

Aggregate wallet balances only when an explicit, evidence-backed cluster model is available. Preserve raw per-wallet values and the uncertainty of any cluster aggregation.

## 3. Simplified curve sensitivity

For an idealized buy with effective quote input q, ignoring fees and integer rounding:

X' = X + q

Y' = K / (X + q)

The post-trade marginal price is:

P' = X' / Y'

Therefore:

P' / P = (1 + q / X)^2

For small q/X:

ΔP / P ≈ 2q / X

Interpretation:

- Relative price impact depends on trade size relative to the virtual quote reserve.
- The same notional can have different price impact at different curve states.
- A low-depth state can produce a large visible candle move from a relatively small number of executions.
- This does not establish manipulation: legitimate early demand, arbitrage, and ordinary volatility can produce similar effects.

For an idealized sell with token input u:

Y' = Y + u

X' = K / (Y + u)

P' / P = (1 + u / Y)^(-2)

For small u/Y:

ΔP / P ≈ -2u / Y

These expressions are diagnostics for sensitivity, not execution instructions or a live-trading quote engine.

## 4. Fees and exact quote behavior

The simplified invariant is insufficient for exact replay. The Pump public IDL exposes fee-aware quote paths, including total fee basis points, integer floor/ceiling operations, reserve fields, and instruction variants. Therefore:

1. Identify the exact program version and instruction variant for each event.
2. Read the fee configuration applicable to that event.
3. Reproduce integer arithmetic and rounding exactly.
4. Distinguish user spend amount, curve-effective amount, fee amounts, and actual reserve deltas.
5. Reconcile the computed state against authoritative account snapshots.

Do not hard-code a fee rate from a secondary article or assume all token / quote-mint paths share identical parameters.

## 5. Dev-perspective state without an execution playbook

Represent the Dev's observable position as:

D_t = (I_direct,t, I_associated,t, B_quote,t, A_t, U_t)

Where:

- I_direct,t = inventory in directly identified creator / issuer-controlled addresses.
- I_associated,t = estimated inventory in addresses with relationship evidence, always reported with confidence bounds.
- B_quote,t = quote-asset balance changes attributable to directly observed Dev-related addresses.
- A_t = relevant creator / mint / program authorities, where applicable.
- U_t = uncertainty about undisclosed ownership and off-chain information.

Do not assume that every early wallet belongs to the Dev. Do not infer common control from one funding transfer or timing correlation. The model should represent direct evidence, probable association, and unknown ownership as separate categories.

The Dev's information and inventory asymmetry is a risk factor for outside participants. The defensive system should quantify what is observable and explicitly mark what is unknowable.

## 6. Market activity: gross turnover versus net position change

For a window W, raw gross quote turnover is:

V_gross(W) = Σ quote_notional_j

This counts each executed trade's quote notional as positive turnover.

For a wallet group G, calculate inventory change from the complete ledger:

ΔH_G^token(W) = H_G^token(t_end) − H_G^token(t_start)

Also calculate quote-asset balance change, including fees and transfers where observable.

A useful divergence feature is:

D_flow(W,G) = 1 − min(1, |net_flow_G(W)| / (V_gross,G(W) + ε))

This is only a screening feature. A high value can arise from arbitrage, inventory recycling, transfers, or other legitimate activity. It is not a wash-trading verdict.

Important distinction:

- Trade volume describes executed turnover.
- Net inventory change describes how much exposure a group accumulated or released.
- Net quote flow describes quote-asset movement.
- Independent demand describes the estimated activity of unrelated economic participants.

These are four different quantities and must remain separate.

## 7. Participant concentration and effective breadth

Let s_i be the share of observed quote turnover attributed to wallet i or to an evidence-backed cluster i.

HHI = Σ s_i²

Effective participant count:

N_eff = 1 / HHI

Report at least:

- address-level N_eff
- evidence-cluster N_eff
- cluster confidence and coverage
- unknown / unclassified share

A market with many addresses can still have low effective breadth if activity is concentrated. Conversely, a low address count does not prove manipulation; legitimate early markets can naturally be concentrated.

## 8. Early inventory and latent sell-overhang

The model should distinguish:

- creator / issuer directly identified inventory
- probable related-party inventory
- early-holder inventory
- sniper inventory
- organic retail inventory
- curve-held unsold inventory
- unknown / unclassified inventory

Define a potential-overhang estimate only over inventory whose sellability and ownership status are sufficiently supported. Do not treat all held tokens as immediately sellable or assume that all holders intend to sell.

A defensive overhang panel should show:

- amount and share of supply by evidence category
- concentration and uncertainty range
- recent net inventory changes
- transfer activity separated from market sells
- recent independent net demand proxies
- curve state and remaining curve inventory

Do not turn this metric into a recommendation for when an issuer should sell. Its purpose is to warn outside participants when the visible market may understate concentrated latent supply.

## 9. Candle integrity features

Raw OHLCV for window W must be computed from all confirmed executions in chain order:

- Open = first confirmed execution price
- High = maximum confirmed execution price
- Low = minimum confirmed execution price
- Close = last confirmed execution price
- Volume = sum of quote notional (and separately base-token amount)

Attach diagnostic features without modifying the raw candle:

### 9.1 Execution concentration

CandleConcentration(W) = maximum participant-cluster quote notional / total quote notional

If cluster attribution is uncertain, report a range and the unknown share.

### 9.2 Effective participant breadth

Compute N_eff from participant shares within the candle, separately for buyer and seller sides where side classification is reliable.

### 9.3 Price impact

PriceImpact(W) = |ln(P_close / P_open)|

Normalized impact should compare the observed move with the adapter-derived depth reference and the actual event sequence. Do not compare unlike quote assets or use a stale reserve snapshot.

### 9.4 Impact persistence

Let M be the maximum absolute log-price displacement during the interval and R_h be the signed log return at horizon h from the interval start.

Persistence_h = R_h / sign(R_peak)M

Clamp only for display if needed; retain the raw value. Values near one mean much of the peak move remains; values near zero mean the peak move has largely retraced; negative values mean the move reversed. This is a descriptive statistic, not proof of intent.

### 9.5 Wick and event-count context

Upper/lower wick ratios should always be displayed with:

- number of executions
- number of distinct addresses
- effective participant breadth
- largest participant share
- price impact normalized by depth
- data completeness

A long wick formed by a small number of concentrated executions should be labeled as low-breadth price action, not automatically erased from the chart.

## 10. Inner-market lifecycle and changing observability

| Phase | Main uncertainty | Defensive focus |
|---|---|---|
| Launch / first trades | Very little history; initial inventory and funding graph are incomplete | Preserve launch metadata, direct allocations, earliest funding evidence, and data-quality caveats |
| Early curve | Low sample size and high sensitivity to relative trade size / virtual reserve | Price impact, execution concentration, independent buyer proxies, early-holder inventory |
| Middle curve | More history but turnover can still be concentrated | Gross/net divergence, participant breadth, holder changes, transfer-adjusted inventory |
| Near graduation | Curve state and remaining inventory become critical; late entrants may have little time to assess risk | State reconciliation, sell-overhang evidence, curve completion status, concentration, execution quality |
| Graduation boundary | Atomic state transition and indexing gaps may confuse chart reconstruction | Verify program state transition and migration events; do not splice inconsistent states |

These phases are observation regimes, not instructions for an issuer to act.

## 11. Attack-to-observable mapping

| Threat family | What can be misleading | Observable evidence | Important alternative explanation |
|---|---|---|---|
| Early inventory concentration | Holder count may understate economic concentration | HHI, direct allocations, funding graph, inventory transfers | Custodians, team allocations, shared service wallets |
| Coordinated wallet behavior | Address count may overstate independent breadth | Timing/direction correlation, common funding, repeated counterparties | Legitimate groups, market bots, shared exchange funding |
| Circular / low-net-flow activity | Gross turnover may overstate net demand | Gross/net divergence, group inventory change, repeated flow paths | Arbitrage and inventory management |
| Transient curve impact | Candle may imply durable demand | Impact/depth, event count, concentration, persistence | Genuine news shock or ordinary volatility |
| Early-holder sell pressure | Visible market may understate latent supply | Inventory decrease, cluster sell flow, transfer-adjusted balances | Portfolio rebalancing or unrelated holders selling |
| MEV / ordering effects | Execution price may not represent broad willingness to pay | Transaction order, pre/post execution state, victim-price impact | Congestion and ordinary priority-fee competition |
| Data/indexer distortion | Volume or candle may be incomplete or duplicated | Signature deduplication, slot reconciliation, reserve parity | Temporary RPC/indexer lag |

No single feature is sufficient for a definitive accusation.

## 12. V1 model outputs

For each time window, publish a structured state snapshot:

- curve state: virtual reserves, real reserves, fees, progress, completion state
- raw market: OHLCV, execution count, buy/sell notional
- participant breadth: address count, effective count, unknown share
- inventory: direct / probable / unknown categories and confidence
- flow: gross turnover, net quote flow, net token inventory change
- impact: price impact, normalized impact, persistence, wick context
- integrity: data completeness, state-reconciliation status
- alerts: evidence, counter-evidence, confidence, model version

Do not output a single “healthy market” label without showing the underlying dimensions.

## 13. First hypotheses to test

H1. Gross volume is a weak proxy for independent demand when participant concentration is high.

H2. Price movement normalized by virtual-reserve depth is more comparable across curve states than raw percentage movement alone.

H3. Wallet-level inventory change, when combined with funding and transfer evidence, helps distinguish independent accumulation from correlated turnover.

H4. Early-holder concentration and curve state jointly provide more useful sell-overhang context than holder count alone.

H5. MEV-related execution distortion can affect candle quality without necessarily indicating directional demand.

H6. Data completeness and reserve reconciliation must be treated as first-class confidence variables; otherwise the detector will overstate certainty.

Each hypothesis must be tested against organic baselines and counterexamples before being accepted.

## 14. Source references

- Pump.fun official bonding-curve documentation: https://solana.pump.fun/docs/bonding-curve
- Pump.fun public program IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.ts

The official docs describe the curve as a constant-product AMM using virtual reserves and describe automatic graduation to PumpSwap. The public IDL exposes versioned instructions and fee-aware quote arithmetic. Implementation must pin and validate the exact program / IDL revision used for replay.
