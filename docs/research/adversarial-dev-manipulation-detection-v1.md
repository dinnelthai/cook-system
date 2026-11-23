# Adversarial Dev Model & Manipulation-Resistance Tests — V1

- Status: Defensive research specification
- Version: 0.1
- Scope: Pump.fun pre-graduation bonding-curve phase
- Mode: Offline, synthetic, reproducible simulation
- Related: inner-market-adversarial-simulator-v1.md, inner-market-math-model-v1.md, inner-market-agent-game-model-v1.md, initial-inventory-demand-absorption-v1.md

## 1. Purpose and boundary

This document extends the simulator's threat model to include an adversary who has issuer-side information and inventory advantages and who may attempt to make market activity or wallet attribution misleading.

The purpose is to test whether a defensive observer can detect suspicious patterns despite incomplete identity evidence, noisy market data, and overlapping legitimate explanations.

This is not a live-market playbook. It must not describe or implement how to conceal real Dev ownership, conduct wash trading, manufacture deceptive volume, induce a price move, manipulate retail participants, or distribute inventory through deceptive execution. All adversarial cases below are abstract, synthetic test fixtures with simulated identities and no transaction-submission capability.

## 2. Threat model: hidden controller versus observable addresses

Let:

- Z_i = latent economic controller of address i.
- A_i = public address identity.
- E = observed evidence graph.
- G* = true controller relationship graph, unavailable to the observer.
- G_hat = evidence graph inferred from public observations.

The observer estimates:

P(Z_i = Z_j | E)

This probability is uncertain. It is not a direct observation of ownership.

### Required attribution classes

1. **Directly verified** — explicit on-chain authority or other strong, independently verifiable evidence.
2. **Probable association** — multiple independent evidence types support a relationship.
3. **Weak association** — limited evidence, such as one common funding event or one correlated time window.
4. **Unknown** — insufficient evidence.

Never turn a weak association into a claim of common control. Never assume that every early buyer is related to the issuer.

### Robustness requirement

The simulator should test detector performance when the evidence graph is incomplete, noisy, delayed, or contradictory. It should not generate or recommend real-world techniques for defeating wallet attribution.

Use generic data-quality perturbations such as:
- randomly missing graph edges;
- delayed appearance of some observations;
- incomplete transaction history;
- ambiguous exchange / custody funding labels;
- address reuse and unrelated users sharing infrastructure;
- conflicting evidence from different time windows.

These are defensive robustness tests, not instructions for hiding ownership.

## 3. Adversarial scenario families

The scenario engine may create the following abstract patterns. Each scenario must have synthetic IDs, a fixed random seed, explicit ground-truth labels, and a separate data namespace.

### A. Hidden-control attribution ambiguity

**Synthetic condition:** several addresses have a latent common-controller label, but the observer receives only partial relationship evidence. A separate negative-control cohort contains unrelated wallets with superficially similar activity.

**Defensive questions:**
- Does the detector distinguish direct evidence from probabilistic association?
- Does it preserve an unknown category instead of forcing a binary answer?
- Does it avoid merging unrelated wallets?
- How quickly does confidence fall when evidence is missing?

**Measures:** cluster precision / recall, Brier score, calibration error, unknown-share accuracy, and false merges.

No address-concealment recipes or evasion optimization are permitted.

### B. Circular-flow / wash-like turnover signature

**Synthetic condition:** an offline event fixture contains repeated inventory round trips and gross turnover that is large relative to net group inventory change. It is explicitly tagged as synthetic and is not broadcast or submitted to a chain.

**Defensive questions:**
- Does the model distinguish gross turnover from net demand?
- Can it identify repeated counterparties and repeated inventory paths?
- Does it avoid classifying legitimate cross-market arbitrage as wash activity?
- Does it preserve the original executions in raw OHLCV while attaching a suspicious-flow overlay?

**Measures:**
- gross quote turnover;
- net token inventory change;
- net quote flow;
- round-trip inventory ratio;
- repeated-counterparty concentration;
- evidence coverage and confidence.

A high gross-to-net divergence is a review signal, not proof of wash trading.

### C. Abrupt sell-pressure / transient drawdown signature

**Synthetic condition:** an offline scenario introduces a concentrated sell-pressure shock, followed by one of several possible market responses: persistent decline, partial recovery, full recovery, or continued volatility.

**Defensive questions:**
- Was the price move caused by a small number of executions or broad selling?
- Did the event materially change holder inventory?
- Was the move large relative to the curve's state and available depth?
- Did independent buyers enter, and did they retain inventory?
- Was the apparent recovery supported by broad participation or only a narrow set of events?

**Measures:**
- sell notional and token amount;
- seller breadth and concentration;
- holder inventory deltas;
- normalized price impact;
- impact persistence at multiple horizons;
- independent net accumulation;
- curve-state reconciliation.

The scenario must not encode recommended trade sizes, timing, routing, or a method to create a real-world false dump.

### D. Price recovery with weak breadth

**Synthetic condition:** the price reference recovers after a drawdown, but the recovery has low effective participant breadth or incomplete independent-demand evidence.

**Defensive questions:**
- Does the chart visually imply stronger recovery than the underlying participation supports?
- Is the recovery based on a broad set of independent buyers?
- Is there a discrepancy between price recovery and net holder accumulation?
- Is the data complete enough to make this comparison?

**Measures:**
- price recovery ratio;
- effective buyer count;
- largest participant share;
- net token accumulation;
- gross-to-net flow divergence;
- cross-market confirmation where available.

A recovery with low breadth is a caution signal, not proof of manipulation.

### E. Inventory distribution / holder transition

**Synthetic condition:** inventory leaves a previously concentrated holder cohort over time. The simulator labels whether each change is a market sell, a transfer, a custody movement, or unknown.

**Defensive questions:**
- Did the cohort's balance decrease through actual market sells or merely transfers?
- Did new holders acquire tokens through curve trades?
- Did the number of addresses increase without equivalent independent market demand?
- Did the original concentration migrate to other addresses or genuinely broaden?
- What quote proceeds are directly observable, and what remains unknown?

**Measures:**
- cohort balance delta;
- market-sell notional;
- transfer notional, kept separate;
- new owner addresses;
- independent-demand lower / central / upper estimates;
- holder HHI and effective holder count over time;
- attribution confidence.

Do not infer that a transfer is a sale, that a new address is a new person, or that an inventory reduction proves a specific controller's intent.

### F. Mixed adversarial and organic activity

**Synthetic condition:** combine organic KOL-driven demand, legitimate arbitrage, early-holder selling, incomplete funding provenance, and one or more suspicious flow signatures.

**Purpose:** prevent the detector from succeeding only on clean textbook examples.

**Measures:** per-alert precision / recall, false-positive rate by legitimate behavior class, calibration, and explanation quality.

## 4. Unified event and inventory accounting

Every synthetic or observed event must use a canonical event type:

- CURVE_BUY
- CURVE_SELL
- TOKEN_TRANSFER
- FEE_PAYMENT
- AUTHORITY_EVENT
- ACCOUNT_BALANCE_SNAPSHOT
- CURVE_STATE_SNAPSHOT
- DATA_GAP
- SYNTHETIC_EVENT

Transfers must never be counted as curve buys or sells. Synthetic events must never be mixed with observed mainnet events.

For each wallet or evidence-based group G and interval W, compute:

- gross buy quote notional;
- gross sell quote notional;
- net quote flow;
- net token inventory change;
- transfer-in and transfer-out;
- start and end balance;
- fee amounts;
- attribution confidence;
- data completeness.

Do not net transfers into trade flow. Do not infer realized profit from mark-to-market balances. Only calculate realized proceeds where actual sell executions are observed and attributable with stated confidence.

## 5. Defensive feature families

### 5.1 Identity and control uncertainty

- direct authority evidence;
- funding provenance evidence;
- repeated counterparty evidence;
- temporal / directional correlation;
- transfer-graph evidence;
- evidence age and missing-history coverage;
- cluster stability under data perturbation.

Output a probability or evidence grade with counter-evidence. Do not output an unqualified owner identity.

### 5.2 Circular-flow and turnover quality

- gross turnover;
- net token inventory change;
- net quote flow;
- repeated-counterparty share;
- inventory round-trip frequency;
- wallet-group balance conservation;
- cross-market arbitrage evidence.

A detector must include a legitimate-arbitrage counterexample set.

### 5.3 Drawdown and recovery quality

- raw OHLCV;
- price impact normalized by adapter-derived curve depth;
- seller / buyer effective breadth;
- largest participant share;
- drawdown magnitude and duration;
- recovery magnitude and duration;
- persistence at multiple horizons;
- net inventory accumulation after the move.

Raw candles remain immutable. Integrity labels are an overlay.

### 5.4 Inventory distribution

- holder cohort balances;
- direct / probable / unknown attribution bands;
- market sells versus transfers;
- new owner count versus new buyer count;
- HHI and effective holder count;
- concentration migration;
- observed quote proceeds and their attribution confidence.

### 5.5 Data integrity

- duplicate-signature detection;
- transaction-order completeness;
- slot gaps;
- stale account snapshots;
- curve reserve reconciliation;
- token supply reconciliation;
- synthetic / observed data separation.

## 6. Joint inference: no single metric proves manipulation

A suspicious market-quality alert should require multiple independent evidence families, and must show counter-evidence.

Examples:

| Observed pattern | Possible interpretation | Required counter-check |
|---|---|---|
| High gross turnover, low net inventory change | Circular flow, arbitrage, or inventory recycling | Cross-market basis, counterparty graph, fee and inventory ledger |
| Many addresses, low effective participant breadth | Concentrated activity or custody / account fragmentation | Owner normalization, exchange and custody labels |
| Large drawdown followed by recovery | Temporary impact, genuine reversal, or concentrated flow | Breadth, persistence, independent accumulation, curve state |
| Early cohort balance falls | Market distribution or simple transfer | Transaction type, destination, quote proceeds |
| Similar timing across wallets | Common public signal or coordinated behavior | Funding, counterparties, repeated cross-token patterns |
| Price rises while concentration remains high | Narrow demand or normal early-market concentration | Cohort balances, independent demand bounds, data coverage |

The output must use language such as possible, consistent_with, and insufficient_evidence rather than categorical accusations.

## 7. Adversarial robustness evaluation

For every detector, test:

1. **Clean positive cases:** strong evidence of the target behavior.
2. **Hard negatives:** legitimate activity that resembles the target.
3. **Partial observability:** missing funding history, incomplete slots, delayed snapshots.
4. **Mixed causes:** more than one behavior in the same time window.
5. **Regime shifts:** launch, early curve, middle curve, near graduation.
6. **Out-of-distribution cases:** behaviors not represented in training fixtures.

Report:
- precision and recall by scenario family;
- false-positive rate by hard-negative family;
- detection delay;
- confidence calibration;
- graph-cluster stability;
- event / balance reconciliation error;
- alert explanation coverage.

Do not tune a detector to maximize a single manipulation score. The objective is reliable evidence classification with controlled false positives.

## 8. Required alert contract

Each alert must include:

- alert_type
- severity
- time_window
- observed_facts
- inferred_relationships
- evidence[]
- counter_evidence[]
- unknowns[]
- confidence
- data_completeness
- model_version
- scenario_id for synthetic tests
- explanation
- defensive_interpretation

Recommended alert types:

- POSSIBLE_CONTROL_CLUSTER
- CIRCULAR_FLOW_SIGNATURE
- LOW_BREADTH_PRICE_SHOCK
- WEAK_BREADTH_RECOVERY
- EARLY_COHORT_INVENTORY_DECLINE
- TRANSFER_VS_SELL_MISMATCH
- GROSS_NET_DEMAND_DIVERGENCE
- ATTRIBUTION_UNCERTAINTY
- CURVE_STATE_OR_DATA_MISMATCH

## 9. Implementation sequence

1. Extend the event schema to distinguish curve trades, transfers, fees, snapshots, and synthetic events.
2. Build a wallet evidence graph that stores provenance and uncertainty, not just cluster IDs.
3. Add synthetic hidden-control labels for evaluation only; keep them unavailable to detector inference.
4. Add circular-flow fixtures with explicit ground truth and legitimate-arbitrage hard negatives.
5. Add drawdown / recovery fixtures with varied participation breadth and persistence.
6. Add holder-cohort inventory transitions with sells and transfers separated.
7. Implement feature extraction and explainable alert rules.
8. Run robustness tests under incomplete and noisy data.
9. Publish false-positive analysis before integrating alerts into a user-facing product.

## 10. Safety and integrity invariants

- No mainnet transaction construction, signing, or submission.
- No wallet orchestration.
- No practical instructions for concealing issuer ownership or defeating attribution.
- No real-world wash trading or deceptive volume execution.
- No price-manipulation or retail-inducement optimization.
- No issuer exit timing, sizing, or distribution strategy.
- Synthetic adversarial scenarios are clearly labeled, isolated, and seeded.
- Raw observed trades and candles are immutable.
- Transfers are never silently reclassified as trades.
- Probabilistic identity inference always exposes uncertainty and counter-evidence.

## 11. Acceptance criteria

- [ ] Hidden-controller ground truth exists only in offline evaluation fixtures.
- [ ] Detector code cannot read hidden labels during ordinary inference.
- [ ] Wallet graph supports missing, delayed, and conflicting evidence.
- [ ] Unrelated wallets with shared infrastructure are included as hard negatives.
- [ ] Circular-flow signatures are distinguished from legitimate arbitrage as far as evidence permits.
- [ ] Synthetic drawdown and recovery events are evaluated at multiple curve states.
- [ ] Market sells and token transfers are accounted for separately.
- [ ] Inventory distribution is measured as cohort balance change, not inferred intent.
- [ ] Raw OHLCV is preserved and alerts are overlays.
- [ ] Every alert includes evidence, counter-evidence, unknowns, confidence, and data completeness.
- [ ] No live manipulation, concealment, or automated execution functionality exists.
