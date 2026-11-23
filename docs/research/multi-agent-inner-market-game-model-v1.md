# Multi-Agent Inner Market Game Model — V1

- Status: Research specification
- Version: 0.1
- Scope: Pump.fun pre-graduation bonding-curve phase
- Mode: Offline, event-driven, reproducible simulation
- Related: inner-market-math-model-v1.md, inner-market-agent-game-model-v1.md, initial-inventory-demand-absorption-v1.md, adversarial-dev-manipulation-detection-v1.md

## 1. Research objective

Unify the issuer / Dev, early holders, snipers, independent traders, retail participants, KOL information sources, arbitrageurs, and MEV-related execution actors in one shared market simulation.

The simulator should explain how heterogeneous participants and incomplete information produce observed:

- curve price and reserve changes;
- raw OHLCV and gross turnover;
- holder inventory changes;
- participant breadth and concentration;
- price impact and recovery;
- wallet-relationship evidence;
- market-integrity alerts.

The objective is to measure market quality and test detection robustness, not to optimize manipulation, deceptive volume, issuer exits, or retail inducement. All scenarios are offline and synthetic; there is no live transaction construction, signing, submission, or wallet orchestration.

## 2. Formal model: partially observable stochastic market game

Represent the system as:

G = (N, S, A, O, T, R, Π)

Where:

- N: simulated participant agents.
- S: shared market state.
- A: available action classes.
- O: agent-specific observations.
- T: program-defined state transition function.
- R: role-specific utility / behavior model.
- Π: stochastic behavior policies.

This is a partially observable stochastic game. Agents do not receive the full state, and the observer / detector does not receive hidden agent labels.

### 2.1 Shared market state

At event time t:

S_t = (C_t, H_t, E_t, M_t, I_t, D_t)

- C_t: versioned bonding-curve state (virtual reserves, real reserves, fees, progress, completion).
- H_t: wallet-level quote and token inventory ledger.
- E_t: ordered execution, transfer, fee, and account-state event ledger.
- M_t: market observations (raw price, OHLCV, volume, external reference prices where available).
- I_t: information state (public signals, KOL broadcasts, observation delays, source reliability).
- D_t: data-quality state (missing events, stale snapshots, reconciliation status).

The true controller labels and agent role labels exist only in the simulation harness. They are not part of the detector's ordinary observation.

### 2.2 Agent-specific observation

For agent i:

O_i,t = h_i(S_t, θ_i, L_i,t) + ε_i,t

- h_i: information-visibility function.
- θ_i: agent traits.
- L_i,t: information and execution latency.
- ε_i,t: stochastic observation noise.

Examples of legitimate information asymmetry:
- a fast participant observes launch events earlier;
- a retail participant sees a delayed chart or social post;
- an arbitrage agent observes multiple public venue prices;
- an issuer knows its own inventory and launch configuration;
- the detector may have incomplete indexing or delayed balance snapshots.

The simulation must not provide all agents with perfect information.

## 3. Agent catalogue and state

Each agent has a stable synthetic ID and a role that can change over time. Roles are behavior classes, not claims about real-world wallet identity.

| Agent class | Main objective / constraint | Distinctive model parameters |
|---|---|---|
| Issuer / Dev | Holds issuer-side information and may have initial inventory; actions are observed and evaluated for market-quality effects | direct inventory, authority metadata, information advantage, disclosure state |
| Early holder | Manages inventory acquired near launch | entry cohort, current balance, holding horizon, risk tolerance |
| Sniper / fast entrant | Responds quickly to launch or public state changes | observation latency, execution latency, short-horizon risk tolerance |
| Independent trader | Forms an independent valuation and trades within risk limits | valuation signal, risk aversion, information sources |
| Retail participant | Heterogeneous, attention- and sentiment-sensitive participant | trade budget, attention, social sensitivity, latency, holding horizon |
| KOL / information broadcaster | Publishes public information or opinion; does not directly set the curve price | audience reach, signal quality, reputation, publication delay |
| Arbitrage / searcher | Responds to price differences across public venues | venue coverage, latency, fees, inventory limits, basis uncertainty |
| MEV / ordering actor | Affects inclusion or ordering conditions and may create execution externalities | priority capability, ordering latency, congestion regime, execution cost |
| Market observer | Reconstructs events and estimates integrity | data coverage, detector version, confidence calibration |

An agent may simultaneously be an early holder and an independent trader. Store role history rather than forcing one permanent label.

## 4. Agent traits and heterogeneous behavior

For each agent i, define a parameter vector:

θ_i = (B_i, H_i, ρ_i, τ_i, ℓ_i, σ_i, α_i, κ_i)

Where, as applicable:

- B_i: quote-asset budget or risk capacity.
- H_i: token inventory.
- ρ_i: risk aversion.
- τ_i: investment / holding horizon.
- ℓ_i: observation and execution latency.
- σ_i: observation noise.
- α_i: sensitivity to public information / sentiment.
- κ_i: transaction-cost and slippage sensitivity.

Parameters should be sampled from role-specific distributions with meaningful within-role variation. Do not assign identical behavior to all agents in one category.

Every simulation run records:
- random seed;
- agent parameter samples;
- scenario configuration;
- program adapter version;
- initial market state;
- event ordering rules.

## 5. Decision and action model

The action set is intentionally limited to abstract simulator actions:

A_i = {HOLD, BUY_REQUEST, SELL_REQUEST, PUBLISH_PUBLIC_SIGNAL, NO_OP}

A buy or sell request is only a simulated intent. The market adapter determines whether it can execute and computes the actual state transition. A public signal is an information event; it does not directly alter the bonding-curve price.

Agent behavior is represented by a stochastic policy:

a_i,t ~ π_i(O_i,t, θ_i, ξ_i,t)

where ξ_i,t is an agent-specific random shock.

For economic trader agents, the behavior model may use a generic risk-adjusted utility:

U_i(a) = E[ΔW_i | O_i,t, a] - ρ_i Var(ΔW_i | O_i,t, a) - Cost_i(a)

This utility is a descriptive behavioral model. V1 must not solve for an optimal issuer manipulation policy or search for actions that maximize deceptive volume, price distortion, or extraction from retail participants.

### 5.1 Role-specific behavior constraints

- Issuer / Dev: represent known inventory, authorities, public disclosures, and observed actions. Do not implement a policy that optimizes concealment, manipulation, or exit timing.
- Sniper / fast entrant: vary latency and risk tolerance; do not encode a reusable launch-sniping execution recipe.
- Retail: sample heterogeneous attention, social sensitivity, budgets, and holding horizons.
- KOL: publish information events with variable accuracy, reach, delay, and reputation; a common public signal must not be treated as proof of common wallet control.
- Arbitrage: respond to public cross-venue price differences with fees, latency, and inventory constraints; keep it distinct from circular-flow scenarios.
- MEV: model abstract ordering / inclusion delay and execution externalities. Do not implement sandwich construction, victim targeting, or transaction-order exploitation instructions.

## 6. Arrival process: independent activity versus common information

A key modeling requirement is to distinguish:

1. independent participants reacting to the same public event;
2. correlated activity from a shared latent controller;
3. ordinary market clustering and random bursts.

A baseline participant arrival process may use a stochastic intensity:

λ_i(t) = exp(β_i,0 + β_i,1 PublicSignal_t + β_i,2 MarketState_t + u_i,t)

Where u_i,t is an idiosyncratic random component.

A public KOL broadcast can increase arrival intensity for many unrelated agents. This creates temporal correlation without implying common control.

For evaluation, maintain separate hidden ground-truth labels for:
- independent response to a common public signal;
- simulated common-control activity;
- unrelated activity with shared infrastructure;
- unknown / unclassified participants.

Only the simulator evaluator may inspect these labels. Detector inference must rely on observable evidence.

## 7. Shared event engine and market transition

All executed curve trades must update the same market state in deterministic event order:

S_(t+1) = T_program(S_t, e_t, config_version)

The event engine must:

1. assign event time and chain-order metadata;
2. resolve simulated inclusion / ordering conditions;
3. validate the event against agent inventory and budget;
4. invoke the versioned curve adapter;
5. apply fees and integer rounding;
6. update reserves and wallet balances;
7. append immutable execution records;
8. reconcile against scheduled account snapshots;
9. update derived OHLCV and market features.

The event engine must distinguish:
- curve buys and sells;
- token transfers;
- fee movements;
- public information events;
- ordering / inclusion metadata;
- synthetic data-quality faults.

Transfers do not alter raw trading volume. Information broadcasts do not directly alter price. Failed or rejected intents do not count as executed trades.

## 8. Transaction ordering and MEV abstraction

The simulator needs transaction ordering because the same set of intents can produce different realized execution prices when ordering changes.

V1 models ordering effects as an abstract queue / inclusion process with:
- arrival time;
- priority class;
- inclusion delay;
- congestion state;
- execution order;
- pre- and post-execution market state.

The model may compare:
- idealized arrival-order execution;
- delayed execution;
- priority-based inclusion;
- stochastic ordering under congestion.

Measure:
- execution-price deviation from the state at intent time;
- user slippage;
- price impact by event;
- ordering concentration;
- failed / expired intent rate.

Do not implement sandwich strategies, victim selection, or instructions for extracting value from real users. The purpose is to quantify execution quality and ordering externalities.

## 9. KOL and social-information process

A KOL is modeled as an information broadcaster, not a price controller.

Each broadcast contains:
- publication time;
- topic / token reference;
- signal direction or sentiment category;
- confidence / stated evidence;
- audience reach distribution;
- observed engagement;
- source-reliability history.

Audience agents respond heterogeneously. Some ignore the signal, some react late, and some independently verify it.

Important evaluation cases:
- high-reach, accurate information causes a legitimate independent buyer burst;
- high-reach, low-quality information causes attention without durable demand;
- several KOLs repeat the same public source;
- unrelated wallets trade synchronously after a public post.

The detector must not label correlated trading as common control without additional evidence.

## 10. Market outcomes and derived metrics

For each time window, compute the following independently:

### Price and curve
- raw OHLCV;
- virtual and actual reserve state;
- curve progress;
- adapter-derived price impact;
- execution-order slippage;
- impact persistence.

### Volume and flow
- gross buy and sell quote notional;
- base-token volume;
- net quote flow;
- net token inventory change;
- transfers, kept separate;
- gross-to-net divergence.

### Participation
- distinct buyer and seller addresses;
- owner-normalized counts;
- effective participant count;
- cluster-adjusted breadth with confidence;
- unknown / unclassified share.

### Inventory
- current-holder balances;
- acquisition cohorts;
- direct / probable / unknown attribution;
- holder HHI and effective holder count;
- confirmed market sells;
- transfers and custody movements;
- observed quote proceeds and cost-basis confidence.

### Market integrity
- concentration;
- independent-demand lower / central / upper estimates;
- potential overhang ranges;
- price-impact quality;
- data completeness;
- reserve and supply reconciliation.

Do not combine these into one opaque health score in V1.

## 11. Scenario matrix

Every scenario is synthetic, isolated, labeled, and reproducible.

| Scenario | Agent mix | Main research question |
|---|---|---|
| Organic baseline | heterogeneous independent buyers and sellers | What does normal early-market variance look like? |
| KOL-driven demand burst | KOL plus unrelated retail / independent traders | Can the detector avoid false coordination alerts? |
| Fast-entry concentration | fast entrants plus organic participants | How does early participation concentration affect price and inventory? |
| Early-holder distribution | early holders and independent buyers | Can actual sells be distinguished from transfers? |
| Arbitrage-heavy market | arbitrage agents plus organic traders | Can high turnover be separated from independent demand? |
| Ordering congestion | users and abstract MEV / priority actors | How much execution quality changes under different ordering regimes? |
| Low-depth price shock | mixed buyers and sellers | How sensitive are candles to small event counts and shallow curve state? |
| Hidden-control evaluation | synthetic common-control labels plus hard negatives | How robust is wallet attribution under incomplete evidence? |
| Mixed adversarial market | multiple overlapping scenario families | Does the detector remain calibrated when causes overlap? |
| Data-quality degradation | any agent mix plus missing / delayed events | Does the system suppress unsupported conclusions? |

## 12. Evaluation framework

### 12.1 Simulation quality

- deterministic replay for a fixed seed;
- reserve and supply reconciliation;
- event-order reproducibility;
- inventory conservation;
- fee accounting accuracy;
- raw OHLCV parity with executed events.

### 12.2 Detector quality

- precision / recall per alert family;
- false-positive rate on KOL-driven independent bursts;
- false-positive rate on legitimate arbitrage;
- false-positive rate on common exchange / custody funding;
- wallet-cluster calibration and stability;
- detection delay;
- confidence calibration;
- unknown / unclassified accuracy.

### 12.3 Market-quality estimation

- independent-demand estimation error;
- participant-breadth estimation error;
- holder-concentration error;
- potential-overhang calibration;
- price-impact estimation error;
- execution-slippage estimation error;
- data-completeness and reconciliation error.

Use held-out random seeds, token scenarios, and time windows. Do not tune and evaluate on the same synthetic runs.

## 13. Architecture

Recommended modules:

- program_adapter/ — exact curve semantics, fees, rounding, and versioning.
- market_state/ — reserves, supply, balances, holder cohorts, and reconciliation.
- event_engine/ — deterministic event queue and state transitions.
- agents/base.py — common identity, observations, traits, and action contract.
- agents/issuer.py — issuer metadata and observed inventory state; no manipulation optimizer.
- agents/fast_entry.py — heterogeneous latency and risk traits.
- agents/retail.py — attention, sentiment, and risk heterogeneity.
- agents/kol.py — public information event generator.
- agents/arbitrage.py — cross-venue basis response under costs.
- agents/mev_abstract.py — abstract ordering / inclusion effects only.
- scenario_lab/ — scenario definitions, seeds, and ground-truth labels.
- synthetic_data/ — isolated synthetic events and candles.
- features/ — flow, inventory, concentration, breadth, price impact, and execution quality.
- detectors/ — explainable integrity alerts.
- evaluation/ — held-out testing, calibration, and false-positive analysis.
- schemas/ — canonical event, state, observation, action, and alert contracts.

The agent policy layer, market transition layer, and detector layer must remain separate. The detector must not receive hidden role or controller labels during ordinary inference.

## 14. V1 implementation sequence

1. Freeze canonical event, observation, action, and state schemas.
2. Verify and pin the exact bonding-curve program adapter.
3. Implement deterministic event replay and accounting invariants.
4. Implement heterogeneous organic buyer / seller agents.
5. Add KOL public-signal process and independent audience responses.
6. Add early-holder cohort and fast-entry behavior classes.
7. Add arbitrage behavior with explicit cross-market fees and latency.
8. Add abstract transaction ordering / congestion model.
9. Add hidden-control and circular-flow fixtures only in isolated evaluation data.
10. Add market-quality features and explainable alerts.
11. Evaluate false positives on legitimate correlated activity.
12. Publish a reproducible simulation report before any product integration.

## 15. Safety and integrity invariants

- No private keys, wallet signing, or transaction submission.
- No live wallet orchestration or automated order placement.
- No issuer manipulation, concealment, exit-timing, or retail-inducement optimizer.
- No wash-trade or deceptive-volume execution.
- No sandwich construction or victim-targeting logic.
- Synthetic hidden labels never enter ordinary detector inference.
- Raw observed OHLCV is immutable; alerts are overlays.
- Transfers, public signals, and failed intents are not counted as executed trades.
- All simulations record seeds, versions, assumptions, and data provenance.
- Every inferred relationship and market-quality estimate exposes uncertainty and counter-evidence.

## 16. Acceptance criteria

- [ ] All agents share one deterministic, versioned curve state.
- [ ] Agents have heterogeneous parameters and partial observations.
- [ ] Public KOL signals can create correlated independent demand.
- [ ] Common-control ground truth is evaluator-only.
- [ ] Arbitrage and MEV ordering effects are separate models.
- [ ] MEV is abstracted as ordering / inclusion externality, not sandwich execution.
- [ ] Transfers and information events never inflate trade volume.
- [ ] Raw candles reconcile exactly to confirmed simulated executions.
- [ ] Market-quality outputs remain multidimensional.
- [ ] Hard negatives cover legitimate synchronized activity and common infrastructure.
- [ ] Evaluation uses held-out seeds and reports calibration / false positives.
- [ ] No live manipulation or transaction execution path exists.

## 17. Open research questions

1. Which public account snapshots are authoritative enough to validate the curve adapter at transaction granularity?
2. What role-specific distributions best approximate early-market latency, budget, and holding-time heterogeneity?
3. How should public KOL reach and attention decay be calibrated without treating engagement as actual buying demand?
4. What minimum evidence is required before wallet-cluster estimates are useful to end users?
5. How should cross-venue reference prices be synchronized with bonding-curve event time?
6. Which abstract ordering model captures execution-quality loss without modeling exploit execution?
7. What level of simulation complexity materially improves detection quality over simpler baselines?
