# Inner Market Adversarial Simulator — V1

- Status: Research specification
- Version: 0.1
- Scope: Pump.fun bonding-curve phase before graduation
- Mode: Offline simulation and defensive analysis only
- Parent: Cook System

## 1. Purpose

Build a reproducible model of the pre-graduation token market from the perspective of a privileged issuer/dev and the other participants who interact with the bonding curve. The purpose is to understand how adversarial behavior can distort observable price, volume, holder distribution, and apparent demand, then develop detection and market-quality controls.

The simulator is not a live trading system and must not provide a recipe for manipulating a real token market. It must not sign or submit transactions, coordinate real wallets, generate deceptive volume, or optimize deceptive price/volume outcomes.

The first version answers four defensive questions:

1. What market states and participant incentives exist during the bonding-curve phase?
2. Which observable patterns can be produced by organic activity, adversarial activity, or both?
3. Which features help distinguish real independent demand from concentrated, circular, or otherwise misleading activity?
4. How should LogEarn preserve raw execution facts while communicating uncertainty about market quality?

## 2. Scope and non-goals

### In scope

- Token creation and initial distribution metadata.
- Bonding-curve state and progress.
- Confirmed buy/sell events and transaction ordering.
- Wallet-level token and quote-asset inventory.
- Early-holder concentration and potential sell overhang.
- Organic retail behavior, sniping, arbitrage/searcher activity, and MEV-related execution effects.
- Wallet relationship evidence based on observable funding and transaction graphs.
- Raw OHLCV generation and separate integrity overlays.
- Reproducible synthetic scenario generation and defensive evaluation.

### Out of scope

- Live mainnet execution, transaction signing, or wallet orchestration.
- Self-trading, wash trading, circular trading instructions, or deceptive volume generation.
- Instructions for timing, sizing, sequencing, or routing manipulative orders.
- Instructions to conceal common wallet control or evade detection.
- Promotion, price-support, pump, dump, or exit optimization.
- PumpSwap / post-graduation market-making. That is a later research phase.

## 3. Market boundary and state model

The simulator models the bonding curve as a versioned market adapter. Do not assume that a generic constant-product formula exactly matches every deployed Pump.fun program version. The adapter must be populated and tested against the exact program implementation and its fee rules.

Represent the market state at event time t as:

S_t = (Rᵛ_t, Rʳ_t, Q_t, H_t, C_t, O_t, F_t)

Where:

- Rᵛ_t: virtual reserve state used by the pricing curve.
- Rʳ_t: real reserve state, where available from the program state.
- Q_t: curve progress / sold-supply state.
- H_t: wallet-level token and quote-asset inventory ledger.
- C_t: participant and wallet-cluster evidence.
- O_t: ordered event / transaction state, including slot and transaction position.
- F_t: fee and program-configuration state.

The price function is adapter-defined:

P_t = g_programVersion(Rᵛ_t, F_t)

The adapter must document reserve semantics, rounding, fees, virtual-reserve initialization, and graduation conditions. If a field cannot be verified from the deployed program or chain state, mark it unknown rather than inventing a value.

### Event types

- TokenCreated
- CurveInitialized
- BuyExecuted
- SellExecuted
- FeeCharged
- TokenTransferred
- AuthorityChanged (if applicable)
- CurveProgressUpdated
- GraduationObserved
- DataGap / StateReconciliation

Each event carries chain, signature, slot, transaction index when available, instruction index when available, timestamp, actor address, token amount, quote amount, fee fields, and source provenance.

## 4. Participant model

All participants are agents in an isolated simulation. Agent labels are hypotheses for scenario generation, not claims about real wallet identity.

| Agent | Economic role | Relevant state / behavior |
|---|---|---|
| Issuer / Dev | Creates the token and may retain initial inventory or privileged information | Initial allocation, disclosed authorities, observed inventory changes |
| Early holder | Receives or acquires inventory before broad participation | Inventory concentration, holding duration, realized transfers |
| Sniper | Competes for early execution opportunities | Entry timing, short holding periods, concentration in early slots |
| Organic buyer | Enters based on independent interest | Independent funding evidence, order size distribution, holding behavior |
| Organic seller | Exits or reduces exposure | Inventory changes, realized sell flow |
| Retail participant | Often smaller, heterogeneous, and sentiment-sensitive | Stochastic decision process, varied latency and risk tolerance |
| Arbitrage / searcher | Responds to price discrepancies or execution opportunities | Cross-market observations, short-lived inventory, price convergence |
| MEV actor | Affects transaction ordering or extracts execution value | Ordering / inclusion evidence and victim-price impact |
| Observer | Measures market integrity | Feature extraction, confidence, alert explanations |

The simulator must support overlapping roles. A wallet may behave like a sniper in one interval and an ordinary holder later. Do not hard-code a wallet's identity from one behavior.

## 5. Dev-perspective threat model

The Dev is modeled as a privileged participant with information and inventory context that ordinary buyers may not have. The model studies the observable consequences of that asymmetry; it does not optimize a Dev's ability to manipulate a live market.

Threat objectives are represented as labels for defensive testing:

1. **Inventory opacity** — outside observers may underestimate the amount of supply economically controlled by related parties.
2. **Demand misclassification** — high gross turnover may be mistaken for independent buyer demand.
3. **Price-impact distortion** — a small number of executions may create a large short-lived price movement in a shallow curve.
4. **Activity concentration** — activity may be concentrated in a small number of wallets, funding sources, slots, or transaction paths.
5. **Sell-overhang surprise** — early or related holders may represent latent supply that is not visible in a simple holder count.
6. **Execution-order distortion** — transaction ordering and MEV may change realized execution prices without representing durable demand.
7. **Graduation-state confusion** — curve progress, remaining inventory, and migration readiness may be misread when data is stale or incomplete.

For each objective, generate labeled synthetic observations and measure whether the defensive pipeline detects the resulting evidence. Do not generate real-world execution instructions or action sequences.

## 6. Inner-market scenario families

Scenarios are generated from distributions and explicit seeds. They must not be authored as reusable live-market playbooks.

### A. Organic baseline

- Heterogeneous buyers and sellers.
- Variable arrival times and order sizes.
- Independent funding sources.
- Natural pauses and bursts.
- Randomized holding periods and risk tolerances.

Purpose: establish normal variance and prevent the detector from labeling every burst as malicious.

### B. Early inventory concentration

- Initial or early supply is concentrated among a limited set of wallets.
- Some holdings are inactive; some move later.
- Relationship evidence may be complete, partial, or absent.

Observe: top-holder concentration, HHI, cluster-adjusted concentration, potential sell overhang, and uncertainty.

### C. Coordinated activity signature

- Several simulated wallets exhibit correlated timing, direction, funding provenance, or transaction counterparties.
- The simulator varies which evidence is visible to the observer.

Observe: wallet-graph features, synchronized activity, cluster confidence, and false-positive behavior on legitimate groups.

### D. Circular-flow / low-net-flow signature

- Gross turnover is high relative to net inventory change across a simulated wallet group.
- The scenario is labeled synthetic and is used only to test detection.

Observe: gross-to-net divergence, repeated counterparties, inventory round trips, and whether the model incorrectly treats all arbitrage as wash activity.

### E. Transient price-impact event

- A short interval contains a large price displacement relative to available curve depth.
- The market may recover, partially recover, or continue moving.

Observe: normalized price impact, impact persistence, wick ratio, independent participation, and reserve consistency.

### F. Early-holder sell pressure

- Previously accumulated inventory enters the sell flow.
- Sell pressure may be distributed across independent holders or concentrated in a related cluster.

Observe: holder-level inventory change, cluster-level net flow, quote-asset proceeds, price impact, and remaining curve capacity.

### G. Arbitrage and MEV interference

- Cross-market price differences and transaction-ordering effects are simulated.
- Arbitrage may improve price consistency while MEV may worsen execution for particular participants.

Observe: cross-market basis, short-horizon convergence, ordering concentration, sandwich-like execution signatures, and victim-price impact.

### H. Data-quality failure

- Missing events, delayed indexing, duplicated records, or inconsistent reserve snapshots are injected.

Observe: reconciliation errors, stale-state detection, confidence downgrade, and safe suppression of unsupported conclusions.

## 7. Observable feature model

Do not collapse all evidence into one opaque manipulation score in V1. Emit independent features, evidence provenance, confidence, and counter-evidence.

### 7.1 Volume and flow

For a time window W:

V_gross(W) = Σ q_i

where q_i is the positive quote-asset notional of each confirmed execution.

For a defined wallet group G, estimate net quote flow and net token inventory change separately:

ΔQ_G(W) = Q_G(t₁) − Q_G(t₀)

Gross turnover and net inventory change answer different questions. High gross volume with low net inventory change is a review signal, not proof of manipulation.

### 7.2 Holder concentration

For wallet or evidence-based cluster shares s_i:

HHI = Σ s_i²

Report both raw-wallet HHI and cluster-adjusted HHI. Cluster-adjusted values must include the clustering method and confidence. Never silently merge addresses.

### 7.3 Wallet relationship evidence

Potential features:

- Common or closely timed funding provenance.
- Repeated transaction counterparties.
- Similar timing and direction patterns.
- Coordinated inventory transfers.
- Shared program interaction patterns.
- Temporal correlation beyond the organic baseline.

Output: relationship edges with evidence type, time range, confidence, and alternative explanations. Common funding alone is insufficient to assert common ownership.

### 7.4 Price impact and persistence

Normalize price change by notional and available curve depth:

I(W) = |Δ ln P(W)| / (notional(W) / depthReference(W))

The exact denominator must be defined by the adapter and validated for the curve's reserve semantics.

Measure persistence at multiple horizons:

Persistence_h = |ln(P_t+h / P_t)| / (|ln(P_t+δ / P_t)| + ε)

This is a diagnostic, not a universal truth score. Use several horizons and retain the raw prices.

### 7.5 Curve and reserve consistency

- Recompute expected state transitions from ordered confirmed events.
- Compare reconstructed reserves with observed program state.
- Track rounding, fees, and incomplete indexing.
- Downgrade confidence when state reconciliation fails.

### 7.6 Independent demand proxies

No single on-chain field proves that a wallet is an independent human buyer. V1 may report proxies:

- Number of distinct buyer addresses.
- Number of evidence-based wallet clusters.
- Distribution of quote notional across buyers.
- Funding-source diversity.
- Repeat-buyer concentration.
- Net new holder count, with transfer and custody caveats.

Label these as *independence proxies*, not verified unique people.

## 8. K-line integrity

Maintain at least two separate representations:

1. **Raw execution OHLCV** — built from every confirmed execution using the actual execution price and quote notional. This is immutable with respect to analytical labels.
2. **Market-integrity overlay** — flags candles or intervals with concentrated flow, uncertain wallet independence, anomalous price impact, MEV effects, or incomplete data.

An optional reference-price series may be produced for analysis, but it must never replace or silently alter raw OHLCV.

For each candle retain:

- Open, high, low, close.
- Gross quote volume and base-token volume.
- Buy/sell notional where reliably classified.
- Execution count.
- Distinct buyer/seller addresses.
- Cluster-adjusted participant estimate and confidence.
- Price-impact diagnostics.
- Data completeness and reconciliation status.
- Linked alert IDs.

Synthetic candles must be labeled synthetic=true and must never be mixed with mainnet observations.

## 9. Detection output contract

Each alert should contain:

- alert_type
- severity
- window_start / window_end
- affected_addresses (when appropriate)
- evidence[]
- counter_evidence[]
- confidence
- data_completeness
- model_version
- scenario_id (simulation only)
- explanation
- recommended_observation (defensive, non-execution guidance)

V1 alert families:

- EARLY_SUPPLY_CONCENTRATION
- POSSIBLE_WALLET_COORDINATION
- GROSS_NET_FLOW_DIVERGENCE
- TRANSIENT_PRICE_IMPACT
- EARLY_HOLDER_SELL_PRESSURE
- MEV_EXECUTION_DISTORTION
- CURVE_STATE_MISMATCH
- INDEXING_OR_DATA_GAP

Avoid categorical labels such as “Dev wallet” or “wash trading confirmed” unless there is independent, verifiable evidence. Prefer “possible association” and “suspicious flow pattern”.

## 10. Simulator architecture

Recommended modules:

- program_adapter/ — versioned bonding-curve semantics, fee rules, state decoding.
- market_state/ — reserves, curve progress, price, supply and inventory ledgers.
- event_engine/ — deterministic event queue and transaction ordering.
- agents/ — participant policies and heterogeneous stochastic behavior.
- scenario_lab/ — labeled scenario definitions and seed management.
- synthetic_data/ — isolated synthetic event and candle generation.
- features/ — volume, flow, wallet graph, concentration, price impact, and data quality.
- detectors/ — explainable rule-based baselines for V1.
- evaluation/ — precision, recall, false-positive rate, calibration, and scenario coverage.
- schemas/ — event, state, feature, alert, and scenario contracts.
- docs/ — research assumptions and validation reports.

Keep simulation policies separate from detection code. The detector must not receive hidden agent labels unless explicitly running an evaluation-only test.

## 11. Evaluation plan

### Baselines

- Organic-only baseline.
- Organic plus early concentration.
- Organic plus coordinated-activity signature.
- Organic plus gross/net flow divergence.
- Organic plus transient price impact.
- Organic plus early-holder sell pressure.
- Organic plus arbitrage / MEV effects.
- Organic plus data-quality failures.
- Mixed scenarios with overlapping causes.

### Metrics

- Precision / recall by alert family.
- False-positive rate on organic bursts and legitimate common-funding patterns.
- Detection delay.
- Confidence calibration.
- Price-impact estimation error.
- Wallet-cluster stability under missing data.
- Volume and net-flow estimation error.
- Candle reconstruction parity with confirmed events.
- State-reconciliation error.

Use multiple random seeds and hold out scenario seeds for evaluation. Do not tune and report performance on the same generated runs.

## 12. V1 implementation sequence

1. **Data contract** — define canonical event and state schemas.
2. **Program adapter** — verify the exact Pump.fun program version, reserve semantics, fees, and graduation rules from authoritative program data.
3. **Deterministic state engine** — replay ordered events and reconcile reconstructed state.
4. **Raw OHLCV** — generate candles strictly from confirmed execution events.
5. **Organic baseline agents** — create heterogeneous, stochastic buyer/seller behavior.
6. **Adversarial scenario injection** — add the scenario families in Section 6 as isolated synthetic test fixtures.
7. **Feature extraction** — implement volume, flow, concentration, wallet graph, price impact, and data-quality features.
8. **Explainable detectors** — implement transparent baselines with counter-evidence.
9. **Evaluation harness** — measure detection and false positives across held-out seeds.
10. **Research report** — document failure cases before considering any production integration.

## 13. Safety and data-integrity invariants

- No private keys, seed phrases, or signing code.
- No RPC transaction submission or mainnet execution path.
- No wallet orchestration or automated order placement.
- No self-trade / wash-trade generation outside clearly labeled offline fixtures.
- No parameter search whose objective is to maximize deceptive volume, price distortion, or retail inducement.
- No advice to conceal wallet relationships or evade detection.
- Raw chain observations are immutable; synthetic data is physically or logically separated.
- Every inference includes uncertainty and provenance.
- A detector alert is not a legal conclusion or proof of common control.

## 14. Open research questions

1. Which exact Pump.fun program versions and migration paths must the adapter support?
2. Which state fields are available at transaction granularity versus only at slot or account-snapshot granularity?
3. How should virtual reserves, real reserves, fees, and curve progress be reconciled across program versions?
4. What is the best baseline for organic early-stage buyer-arrival and order-size distributions?
5. Which wallet-relationship features remain useful when funding history is incomplete?
6. How can the system distinguish legitimate arbitrage from circular activity without over-flagging?
7. What confidence threshold is appropriate for a user-facing warning, given the cost of false accusations?

---

## Initial V1 acceptance criteria

- [ ] Program adapter assumptions are documented and versioned.
- [ ] Event replay is deterministic for a fixed input and seed.
- [ ] Reconstructed curve state reconciles with authoritative snapshots within documented tolerances.
- [ ] Raw OHLCV is reproducible from confirmed execution events.
- [ ] Synthetic events and candles are unmistakably labeled and isolated.
- [ ] Every scenario has a seed, label, and expected observable effects.
- [ ] Detection outputs include evidence, counter-evidence, confidence, and data completeness.
- [ ] Organic bursts and legitimate arbitrage are included in false-positive tests.
- [ ] No live execution or wallet-signing functionality exists in V1.
